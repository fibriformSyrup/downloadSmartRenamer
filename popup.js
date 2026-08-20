// popup.js
document.addEventListener('DOMContentLoaded', function() {
    // 帮助按钮点击事件
    document.getElementById('helpBtn').addEventListener('click', function(e) {
        e.preventDefault();
        showHelp();
    });

    // 加载设置状态
    loadStatus();
});

async function loadStatus() {
    try {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || { enableRename: true };
        const statusDiv = document.getElementById('status');
        
        if (settings.enableRename !== false) {
            statusDiv.textContent = '✓ 已启用';
            statusDiv.style.color = '#4CAF50';
        } else {
            statusDiv.textContent = '✗ 已禁用';
            statusDiv.style.color = '#F44336';
        }
    } catch (error) {
        console.error('加载状态失败:', error);
    }
}

function showHelp() {
    alert(`Smart Renamer 使用说明：

1. 在网页上右键点击图片
2. 选择"用 Smart Renamer 下载"选项
3. 图片将根据您的规则自动重命名

注意：Chrome 扩展无法拦截"另存为"对话框，
请使用右键菜单中的专用选项进行下载。`);
}