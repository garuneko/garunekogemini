const { ipcRenderer } = require('electron');


// UI要素の取得
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const authModal = document.getElementById('auth-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const settingsBtn = document.getElementById('settings-btn');
const cancelKeyBtn = document.getElementById('cancel-key-btn');
const authError = document.getElementById('auth-error');
const modelSelect = document.getElementById('model-select');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// --- 認証・設定関連 ---

async function checkAuth() {
  const isAuth = await ipcRenderer.invoke('check-auth');
  if (!isAuth) {
    authModal.style.display = 'flex';
  } else {
    // 1. 現在のモデルを取得してプルダウンに反映
    const currentModel = await ipcRenderer.invoke('get-current-model');
    if (currentModel) {
      modelSelect.value = currentModel;
    }

    // ★ 2. 過去の会話履歴を取得してUIに復元
    const history = await ipcRenderer.invoke('get-history-for-ui');
    if (history && history.length > 0) {
      history.forEach(msg => {
        // main.js側で role: 'user' または 'ai', text: 中身 に整形してあるのでそのまま渡す
        appendMessage(msg.role, msg.text);
      });
    }
  }
}

settingsBtn.addEventListener('click', () => {
  authModal.style.display = 'flex';
  authError.style.display = 'none';
  apiKeyInput.value = '';
});

cancelKeyBtn.addEventListener('click', () => {
  ipcRenderer.invoke('check-auth').then(isAuth => {
    if (isAuth) {
      authModal.style.display = 'none';
    } else {
      authError.textContent = "最初に使用を開始するにはキーが必要です";
      authError.style.display = 'block';
    }
  });
});

saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    authError.textContent = "キーを入力してください";
    authError.style.display = 'block';
    return;
  }
  saveKeyBtn.disabled = true;
  saveKeyBtn.textContent = "検証中...";
  authError.style.display = 'none';

  const result = await ipcRenderer.invoke('save-api-key', key);
  if (result.success) {
    authModal.style.display = 'none';
    location.reload(); 
  } else {
    authError.textContent = result.error;
    authError.style.display = 'block';
    saveKeyBtn.disabled = false;
    saveKeyBtn.textContent = "保存して開始";
  }
});

// プルダウン変更時のイベントリスナー
modelSelect.addEventListener('change', async (e) => {
  const selectedModel = e.target.value;
  
  // main.js の 'change-model' ハンドラを呼び出す
  const result = await ipcRenderer.invoke('change-model', selectedModel);
  
  if (result.error) {
    console.error("モデル切り替えエラー:", result.error);
    alert(result.error); // 必要に応じてUIでエラー表示
  } else {
    console.log(`モデルを ${selectedModel} に切り替えました`);
    // UI上で「切り替え完了」的なトーストを出してもいいかも
  }
});

clearHistoryBtn.addEventListener('click', async () => {
  const isOk = confirm("会話履歴をリセットして新しいチャットを開始しますか？\n（過去のやり取りは消去されます）");
  if (!isOk) return;

  const result = await ipcRenderer.invoke('clear-history');
  if (result.success) {
    chatContainer.innerHTML = '';
    appendMessage('ai', '新しいチャットを開始しました！');
  }
});

// --- メッセージ表示・送信関連 ---

function appendMessage(role, text, isHtml = false) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  if (role === 'ai') {
    msgDiv.innerHTML = isHtml ? text : marked.parse(text);
  } else {
    msgDiv.innerText = text;
  }
  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

sendBtn.addEventListener('click', async () => {
  const text = userInput.value;
  if (!text) return;

  appendMessage('user', text);
  userInput.value = '';

  if (text.startsWith('/img ')) {
    const prompt = text.replace('/img ', '');
    appendMessage('ai', '画像を作成中...');
    const response = await ipcRenderer.invoke('generate-image', prompt);

    if (response.error) {
      appendMessage('ai', "エラー: " + response.error);
    } else {
      const imgTag = `<img src="${response.image}" style="max-width: 100%; border-radius: 8px; cursor: pointer;" />`;
      appendMessage('ai', imgTag, true); 
    }
  } else {
    const response = await ipcRenderer.invoke('send-to-gemini', text);
    if (response.error) {
      appendMessage('ai', "エラー: " + response.error);
    } else {
      appendMessage('ai', response.text);
    }
  }
});

userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

chatContainer.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
    ipcRenderer.send('show-context-menu', e.target.src);
  }
});

checkAuth();
