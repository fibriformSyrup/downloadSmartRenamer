// content.js

let currentImageForDownload = null;

document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'IMG') {
        currentImageForDownload = {
            src: e.target.src,
            alt: e.target.alt || '',
            filename: getFilenameFromUrl(e.target.src)
        };
    }
});

function getFilenameFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        let filename = pathname.split('/').pop().split('?')[0];
        if (!filename) filename = 'image_' + Date.now() + '.jpg';
        return filename;
    } catch {
        return 'image_' + Date.now() + '.jpg';
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getImageDownloadInfo') {
        sendResponse({ filename: currentImageForDownload?.filename ?? null });
        return true;
    }
    return false;
});

window.downloadImageWithRename = async function () {
    if (!currentImageForDownload) return;

    const imageInfo = currentImageForDownload;
    try {
        const response = await fetch(imageInfo.src);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        chrome.runtime.sendMessage({
            action: 'downloadWithRename',
            url: blobUrl,
            originalUrl: imageInfo.src,         // Plan 2: real URL for domain/rule matching
            originalFilename: imageInfo.filename,
            pageUrl: window.location.href,
            pageTitle: document.title            // Plan 6: {title} variable support
        }, () => {
            URL.revokeObjectURL(blobUrl);
        });
    } catch (error) {
        console.error('下载图片失败:', error);
    }
};
