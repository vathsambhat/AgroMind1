const API = window.location.origin; // same server serves frontend
const socket = io(API);

let currentUser = null;
let currentGroupId = null;

// Offline queue using localForage
const queue = localforage.createInstance({ name: 'agromind-queue' });

// Simple i18n
const langSelect = document.getElementById('lang');
langSelect.addEventListener('change', () => {
  localStorage.setItem('lang', langSelect.value);
  applyLang();
});
function applyLang() {
  const lang = localStorage.getItem('lang') || 'en';
  langSelect.value = lang;
  const dict = (window.I18N && window.I18N[lang]) || window.I18N.en;
  document.getElementById('msgText').placeholder = dict.type_message;
  document.getElementById('syncBtn').textContent = dict.offline_sync;
  document.getElementById('sendBtn').textContent = dict.send;
}
applyLang();

// Elements
const phoneEl = document.getElementById('phone');
const nameEl = document.getElementById('name');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const otpEl = document.getElementById('otp');
const authStatus = document.getElementById('authStatus');

const groupNameEl = document.getElementById('groupName');
const groupDescEl = document.getElementById('groupDesc');
const createGroupBtn = document.getElementById('createGroupBtn');
const groupList = document.getElementById('groupList');

const inviteOut = document.getElementById('inviteOutput');
const inviteLinkBtn = document.getElementById('inviteLinkBtn');
const inviteQrBtn = document.getElementById('inviteQrBtn');

const currentGroup = document.getElementById('currentGroup');
const msgText = document.getElementById('msgText');
const msgImage = document.getElementById('msgImage');
const parentId = document.getElementById('parentId');
const sendBtn = document.getElementById('sendBtn');
const syncBtn = document.getElementById('syncBtn');
const messagesEl = document.getElementById('messages');

// Restore user from storage
try {
  const saved = JSON.parse(localStorage.getItem('user'));
  if (saved) currentUser = saved;
} catch {}
renderAuthStatus();

// OTP
sendOtpBtn.onclick = async () => {
  const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: phoneEl.value }) });
  const data = await r.json();
  authStatus.textContent = data.info || 'OTP sent.';
};

verifyOtpBtn.onclick = async () => {
  const r = await fetch(API + '/auth/verify-otp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: phoneEl.value, name: nameEl.value, otp: otpEl.value }) });
  const data = await r.json();
  if (data.ok) {
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    renderAuthStatus();
    await loadGroups();
    // auto-join link via ?join=
    const params = new URLSearchParams(window.location.search);
    const join = params.get('join');
    if (join) selectGroup(join);
  } else {
    authStatus.textContent = data.error || 'OTP failed';
  }
};

function renderAuthStatus() {
  authStatus.textContent = currentUser ? ('Logged in as ' + currentUser.name + ' (' + currentUser.phone + ')') : 'Not logged in';
}

// Groups
createGroupBtn.onclick = async () => {
  const r = await fetch(API + '/api/groups', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: groupNameEl.value, description: groupDescEl.value }) });
  if (r.ok) {
    groupNameEl.value = ''; groupDescEl.value = '';
    await loadGroups();
    alert('Group created');
  }
};

async function loadGroups() {
  const r = await fetch(API + '/api/groups');
  const groups = await r.json();
  groupList.innerHTML = '';
  groups.forEach(g => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = g.name;
    btn.onclick = () => selectGroup(g._id);
    li.appendChild(btn);
    groupList.appendChild(li);
  });
}
loadGroups();

async function selectGroup(id) {
  currentGroupId = id;
  currentGroup.textContent = 'Current group: ' + id;
  socket.emit('joinGroup', id);
  await loadMessages();
}

// Invite
inviteLinkBtn.onclick = async () => {
  if (!currentGroupId) return alert('Select a group first');
  const r = await fetch(API + '/api/groups/' + currentGroupId + '/invite');
  const data = await r.json();
  inviteOut.innerHTML = '<a target="_blank" href="'+data.link+'">'+data.link+'</a>';
};
inviteQrBtn.onclick = async () => {
  if (!currentGroupId) return alert('Select a group first');
  const r = await fetch(API + '/api/groups/' + currentGroupId + '/qr');
  const data = await r.json();
  inviteOut.innerHTML = '<img src="'+data.qr+'" alt="QR" style="max-width:240px"/>';
};

// Messages
async function loadMessages() {
  const r = await fetch(API + '/api/groups/' + currentGroupId + '/messages');
  const list = await r.json();
  renderMessages(list);
}

function renderMessages(list) {
  messagesEl.innerHTML = '';
  list.forEach(m => {
    const li = document.createElement('li');
    li.className = 'message' + (m.pinned ? ' pinned' : '');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (m.userName || 'Farmer') + ' • ' + new Date(m.createdAt).toLocaleString() + (m.parentId ? (' • reply to ' + m.parentId) : '');
    const txt = document.createElement('div');
    txt.textContent = m.text || '';
    li.appendChild(meta);
    li.appendChild(txt);
    if (m.image) {
      const img = document.createElement('img');
      img.src = m.image;
      img.className = 'msg';
      li.appendChild(img);
    }
    // pin button
    const pinBtn = document.createElement('button');
    pinBtn.textContent = 'Pin';
    pinBtn.onclick = async () => {
      await fetch(API + '/api/messages/' + m._id + '/pin', { method: 'PATCH' });
    };
    li.appendChild(pinBtn);
    messagesEl.appendChild(li);
  });
}

// Send
sendBtn.onclick = async () => {
  if (!currentUser) return alert('Login first');
  if (!currentGroupId) return alert('Select a group');

  const fd = new FormData();
  fd.append('userId', currentUser.id);
  fd.append('userName', currentUser.name);
  fd.append('text', msgText.value);
  fd.append('lang', localStorage.getItem('lang') || 'en');
  if (parentId.value) fd.append('parentId', parentId.value);
  if (msgImage.files[0]) fd.append('image', msgImage.files[0]);

  try {
    const r = await fetch(API + '/api/groups/' + currentGroupId + '/messages', { method:'POST', body: fd });
    if (!r.ok) throw new Error('Network error');
    msgText.value = ''; msgImage.value = ''; parentId.value = '';
  } catch (e) {
    const key = Date.now().toString();
    await queue.setItem(key, { groupId: currentGroupId, payload: fdToObject(fd) });
    alert('Offline — message saved. Click Sync later.');
  }
};

function fdToObject(fd) {
  const o = {};
  for (const [k, v] of fd.entries()) {
    if (v instanceof File) continue;
    else o[k] = v;
  }
  return o;
}

syncBtn.onclick = async () => {
  await syncOffline();
  await loadMessages();
};

async function syncOffline() {
  const keys = await queue.keys();
  for (const k of keys) {
    const item = await queue.getItem(k);
    const fd = new FormData();
    Object.entries(item.payload).forEach(([kk, vv]) => fd.append(kk, vv));
    try {
      await fetch(API + '/api/groups/' + item.groupId + '/messages', { method:'POST', body: fd });
      await queue.removeItem(k);
    } catch (e) {}
  }
}

socket.on('newMessage', (msg) => {
  if (msg.groupId === currentGroupId) {
    loadMessages();
  }
});

socket.on('pinMessage', (msg) => {
  if (msg.groupId === currentGroupId) {
    loadMessages();
  }
});

window.addEventListener('online', () => syncOffline());
