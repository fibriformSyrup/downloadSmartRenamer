// content.js - 用于页面内交互

// 存储当前右键点击的图片信息
let currentImageForDownload = null;

// 监听右键菜单事件
document.addEventListener('contextmenu', function(e) {
    if (e.target.tagName === 'IMG') {
        // 存储当前右键点击的图片信息
        currentImageForDownload = {
            src: e.target.src,
            alt: e.target.alt || '',
            filename: getFilenameFromUrl(e.target.src)
        };
    }
});

// 从URL中提取文件名
function getFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const parts = pathname.split('/');
        let filename = parts[parts.length - 1];
        
        // 移除查询参数
        filename = filename.split('?')[0];
        
        // 如果没有文件名，生成一个
        if (!filename || filename === '') {
            filename = 'image_' + Date.now() + '.jpg';
        }
        
        return filename;
    } catch (e) {
        console.error('获取文件名失败:', e);
        return 'image_' + Date.now() + '.jpg';
    }
}

// 监听来自 background script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getImageDownloadInfo') {
        sendResponse({
            filename: currentImageForDownload ? currentImageForDownload.filename : null
        });
        return true;
    }
    return false;
});

// 导出函数供其他脚本使用
window.downloadImageWithRename = async function() {
    if (!currentImageForDownload) return;
    
    const imageInfo = currentImageForDownload;
    try {
        const response = await fetch(imageInfo.src);
        const blob = await response.blob();
        
        // 创建临时 URL
        const blobUrl = URL.createObjectURL(blob);
        
        // 发送消息给后台脚本进行重命名
        chrome.runtime.sendMessage({
            action: 'downloadWithRename',
            url: blobUrl,
            originalFilename: imageInfo.filename,
            pageUrl: window.location.href,
            referrer: document.referrer
        }, () => {
            URL.revokeObjectURL(blobUrl);
        });
    } catch (error) {
        console.error('下载图片失败:', error);
    }
};