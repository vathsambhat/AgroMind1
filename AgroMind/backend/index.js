import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- Config ----------
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/agromind';
const OTP_CODE = process.env.OTP_CODE || '1234';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend statically
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use('/', express.static(frontendPath));

// ---------- DB ----------
await mongoose.connect(MONGO_URI);
console.log('Mongo connected');

const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  phone: String,
  lang: { type: String, default: 'en' } // en, kn, hi, ta
}, { timestamps: true }));

const Group = mongoose.model('Group', new mongoose.Schema({
  name: String,
  description: String,
}, { timestamps: true }));

const Message = mongoose.model('Message', new mongoose.Schema({
  groupId: String,
  userId: String,
  userName: String,
  text: String,
  image: String,
  lang: { type: String, default: 'en' },
  parentId: { type: String, default: null }, // for threads
  pinned: { type: Boolean, default: false }
}, { timestamps: true }));

// ---------- Uploads (multer) ----------
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// ---------- Auth (OTP - simple demo, no SMS) ----------
app.post('/auth/send-otp', async (req, res) => {
  const { phone } = req.body;
  // In production: send SMS here using a provider; store per-phone OTP server-side.
  res.json({ ok: true, info: 'Use the OTP sent to your phone (demo: ' + OTP_CODE + ')' });
});

app.post('/auth/verify-otp', async (req, res) => {
  const { phone, name, otp } = req.body;
  if (otp !== OTP_CODE) return res.status(400).json({ ok: false, error: 'Invalid OTP' });
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, name: name || 'Farmer', lang: 'en' });
  }
  res.json({ ok: true, user: { id: user._id.toString(), name: user.name, phone: user.phone, lang: user.lang } });
});

// ---------- Groups ----------
app.get('/api/groups', async (req, res) => {
  const groups = await Group.find().sort({ createdAt: -1 });
  res.json(groups);
});

app.post('/api/groups', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: 'Name required' });
  const g = await Group.create({ name, description });
  res.json(g);
});

// Invite link + QR
app.get('/api/groups/:id/invite', async (req, res) => {
  const link = `http://localhost:${PORT}/?join=${req.params.id}`;
  res.json({ link });
});
app.get('/api/groups/:id/qr', async (req, res) => {
  const link = `http://localhost:${PORT}/?join=${req.params.id}`;
  const qr = await QRCode.toDataURL(link);
  res.json({ qr });
});

// ---------- Messages ----------
app.get('/api/groups/:id/messages', async (req, res) => {
  const msgs = await Message.find({ groupId: req.params.id }).sort({ pinned: -1, createdAt: -1 }).limit(500);
  res.json(msgs);
});

app.post('/api/groups/:id/messages', upload.single('image'), async (req, res) => {
  const { userId, userName, text, lang, parentId } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const msg = await Message.create({ groupId: req.params.id, userId, userName, text, image, lang: lang || 'en', parentId: parentId || null });
  io.to(req.params.id).emit('newMessage', msg);
  res.json(msg);
});

app.patch('/api/messages/:id/pin', async (req, res) => {
  const m = await Message.findByIdAndUpdate(req.params.id, { pinned: true }, { new: true });
  if (m) io.to(m.groupId).emit('pinMessage', m);
  res.json({ ok: true });
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  socket.on('joinGroup', (groupId) => {
    socket.join(groupId);
  });
});

server.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
