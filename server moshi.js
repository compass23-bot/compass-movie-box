const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const root = __dirname;
const dataDir = path.join(root, 'data');
const uploadDir = path.join(root, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, 'compass.db'));
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS movies (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 description TEXT DEFAULT '',
 genre TEXT DEFAULT 'Other',
 year INTEGER,
 poster_url TEXT DEFAULT '',
 video_url TEXT DEFAULT '',
 uploaded_by INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);
`);

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword && !db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail)) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run('Administrator', adminEmail, hash, 'admin');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(root, 'public')));

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4','video/webm','video/ogg','image/jpeg','image/png','image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

function sign(user) {
  return jwt.sign({ id:user.id, role:user.role, email:user.email, name:user.name }, JWT_SECRET, { expiresIn:'7d' });
}
function auth(req,res,next) {
  try {
    const token = req.cookies.cmb_token;
    if (!token) return res.status(401).json({error:'Login required'});
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({error:'Invalid or expired session'}); }
}
function admin(req,res,next) {
  auth(req,res,()=> req.user.role === 'admin' ? next() : res.status(403).json({error:'Admin access required'}));
}

app.get('/api/movies', (req,res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const movies = db.prepare(`SELECT id,title,description,genre,year,poster_url,video_url,created_at FROM movies WHERE title LIKE ? OR genre LIKE ? ORDER BY id DESC`).all(q,q);
  res.json(movies);
});
app.get('/api/me', (req,res) => {
  try { const u=jwt.verify(req.cookies.cmb_token, JWT_SECRET); res.json({user:u}); }
  catch { res.json({user:null}); }
});
app.post('/api/register', (req,res) => {
  const {name,email,password}=req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({error:'Name, email and a password of at least 6 characters are required.'});
  try {
    const hash=bcrypt.hashSync(password,12);
    const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim(),email.trim().toLowerCase(),hash);
    const user=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(info.lastInsertRowid);
    res.cookie('cmb_token',sign(user),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*24*60*60*1000});
    res.status(201).json({user});
  } catch(e) { res.status(409).json({error:'That email is already registered.'}); }
});
app.post('/api/login', (req,res) => {
  const {email,password}=req.body;
  const user=db.prepare('SELECT * FROM users WHERE email=?').get((email||'').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password||'',user.password_hash)) return res.status(401).json({error:'Incorrect email or password.'});
  const safe={id:user.id,name:user.name,email:user.email,role:user.role};
  res.cookie('cmb_token',sign(safe),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*24*60*60*1000});
  res.json({user:safe});
});
app.post('/api/logout',(req,res)=>{res.clearCookie('cmb_token');res.json({ok:true});});

app.get('/api/admin/stats', admin, (req,res)=>{
  res.json({users:db.prepare('SELECT COUNT(*) c FROM users').get().c,movies:db.prepare('SELECT COUNT(*) c FROM movies').get().c,admins:db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c});
});
app.get('/api/admin/users', admin, (req,res)=>res.json(db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC').all()));
app.delete('/api/admin/users/:id', admin, (req,res)=>{
  if (+req.params.id === req.user.id) return res.status(400).json({error:'You cannot delete your own account.'});
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id); res.json({ok:true});
});
app.post('/api/admin/movies', admin, upload.fields([{name:'video',maxCount:1},{name:'poster',maxCount:1}]), (req,res)=>{
  const {title,description,genre,year,video_url,poster_url}=req.body;
  if (!title) return res.status(400).json({error:'Movie title is required.'});
  const video = req.files?.video?.[0];
  const poster = req.files?.poster?.[0];
  const videoPath = video ? '/uploads/'+video.filename : (video_url||'');
  const posterPath = poster ? '/uploads/'+poster.filename : (poster_url||'');
  const info=db.prepare('INSERT INTO movies(title,description,genre,year,poster_url,video_url,uploaded_by) VALUES(?,?,?,?,?,?,?)').run(title,description||'',genre||'Other',year?+year:null,posterPath,videoPath,req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM movies WHERE id=?').get(info.lastInsertRowid));
});
app.put('/api/admin/movies/:id', admin, upload.fields([
  {name:'video', maxCount:1},
  {name:'poster', maxCount:1}
]), (req,res) => {

  const movie = db
    .prepare('SELECT * FROM movies WHERE id=?')
    .get(req.params.id);

  if (!movie) {
    return res.status(404).json({
      error: 'Movie not found'
    });
  }

  const {
    title,
    description,
    genre,
    year,
    video_url,
    poster_url
  } = req.body;

  if (!title) {
    return res.status(400).json({
      error: 'Movie title is required.'
    });
  }

  const video = req.files?.video?.[0];
  const poster = req.files?.poster?.[0];

  const videoPath = video
    ? '/uploads/' + video.filename
    : (video_url || movie.video_url);

  const posterPath = poster
    ? '/uploads/' + poster.filename
    : (poster_url || movie.poster_url);

  db.prepare(`
    UPDATE movies
    SET title=?,
        description=?,
        genre=?,
        year=?,
        poster_url=?,
        video_url=?
    WHERE id=?
  `).run(
    title,
    description || '',
    genre || 'Other',
    year ? +year : null,
    posterPath,
    videoPath,
    req.params.id
  );

  const updatedMovie = db
    .prepare('SELECT * FROM movies WHERE id=?')
    .get(req.params.id);

  res.json(updatedMovie);
});

app.get(/.*/, (req,res)=>res.sendFile(path.join(root,'public','index.html')));
app.listen(PORT,()=>console.log(`Compass Movie Box running on http://localhost:${PORT}`));
