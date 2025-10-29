(() => {
  const cfg = window.__APP_CONFIG__ || {};
  const supabaseUrl = cfg.SUPABASE_URL;
  const supabaseAnonKey = cfg.SUPABASE_ANON_KEY;
  const n8nWebhookUrl = cfg.N8N_WEBHOOK_URL; // e.g., http://localhost:5678/webhook/chat
  const bucket = cfg.SUPABASE_BUCKET || 'uploads';

  /** session id for anonymous isolation */
  const sessionKey = 'ts_agent_session_id';
  function getOrCreateSessionId() {
    let s = localStorage.getItem(sessionKey);
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem(sessionKey, s);
    }
    return s;
  }
  const sessionId = getOrCreateSessionId();

  /** init supabase client */
  const sb = (supabaseUrl && supabaseAnonKey) ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;

  /** ui elements */
  const fileInput = document.getElementById('fileInput');
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadStatus = document.getElementById('uploadStatus');
  const fileList = document.getElementById('fileList');
  const messages = document.getElementById('messages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  /** state */
  const uploadedFiles = []; // {path, name, id?}

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendAgentBlock(block) {
    // block: { text, charts?: [{type, url}], code?: string }
    if (block.text) appendMessage('agent', block.text);
    if (Array.isArray(block.charts)) {
      for (const c of block.charts) {
        if (c && c.url) {
          const img = document.createElement('img');
          img.src = c.url;
          img.alt = c.type || 'chart';
          img.style.maxWidth = '100%';
          const wrap = document.createElement('div');
          wrap.className = 'msg agent';
          wrap.appendChild(img);
          messages.appendChild(wrap);
        }
      }
    }
    if (block.code) {
      const pre = document.createElement('pre');
      pre.className = 'msg code';
      pre.textContent = block.code;
      messages.appendChild(pre);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  async function uploadSelectedFiles() {
    if (!sb) {
      uploadStatus.textContent = 'Supabase not configured (check web/config.js).';
      return;
    }
    const files = Array.from(fileInput.files || []);
    if (!files.length) {
      uploadStatus.textContent = 'Select CSV/Excel files to upload.';
      return;
    }
    uploadStatus.textContent = 'Uploading...';
    for (const f of files) {
      const path = `${sessionId}/${Date.now()}-${f.name}`;
      const { data, error } = await sb.storage.from(bucket).upload(path, f, { upsert: false, cacheControl: '3600' });
      if (error) {
        console.error('Upload error', error);
        uploadStatus.textContent = `Upload failed: ${error.message}`;
        return;
      }
      uploadedFiles.push({ path, name: f.name });
      const li = document.createElement('li');
      li.textContent = `${f.name} → ${path}`;
      fileList.appendChild(li);
      // optional: record in a table via RPC (future)
    }
    uploadStatus.textContent = 'Upload complete.';
  }

  async function sendMessage() {
    const text = (messageInput.value || '').trim();
    if (!text) return;
    appendMessage('user', text);
    messageInput.value = '';
    const payload = {
      sessionId,
      message: text,
      files: uploadedFiles, // n8n can fetch signed URLs as needed
      timestamp: new Date().toISOString(),
    };
    try {
      if (!n8nWebhookUrl) throw new Error('n8n webhook not configured');
      const res = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`n8n error ${res.status}`);
      const data = await res.json();
      // Expect shape: { text, charts?: [{type, url}], code?: string }
      appendAgentBlock(data);
    } catch (e) {
      console.error(e);
      appendMessage('agent', `Error: ${e.message}`);
    }
  }

  uploadBtn?.addEventListener('click', uploadSelectedFiles);
  sendBtn?.addEventListener('click', sendMessage);
  messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      sendMessage();
    }
  });
})();


