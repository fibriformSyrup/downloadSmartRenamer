// background.js

// 初始化右键菜单
chrome.runtime.onInstalled.addListener(() => {
    // 移除旧的菜单项（如果有）
    chrome.contextMenus.removeAll(() => {
        // 创建右键菜单
        chrome.contextMenus.create({
            id: 'downloadWithSmartRename',
            title: '用 Smart Renamer 下载',
            contexts: ['image'],
            documentUrlPatterns: ['<all_urls>']
        });
    });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'downloadWithSmartRename' && info.srcUrl) {
        try {
            // 获取设置
            const result = await chrome.storage.local.get(['settings', 'rules']);
            const settings = result.settings || { enableRename: true, downloadPath: '' };
            const rules = result.rules || [];
            
            if (!settings.enableRename) {
                // 直接下载不重命名
                chrome.downloads.download({
                    url: info.srcUrl,
                    filename: settings.downloadPath ? 
                        `${settings.downloadPath}/${getFilenameFromUrl(info.srcUrl)}` : 
                        getFilenameFromUrl(info.srcUrl)
                });
                return;
            }
            
            // 尝试从页面 URL 获取上下文信息
            const pageDomain = new URL(tab.url).hostname;
            const imageDomain = new URL(info.srcUrl).hostname;
            
            // 构建规则匹配上下文
            const context = {
                pageUrl: tab.url,
                imageUrl: info.srcUrl,
                pageDomain: pageDomain,
                imageDomain: imageDomain,
                filename: getFilenameFromUrl(info.srcUrl)
            };
            
            // 应用重命名规则
            let newFilename = applyRules(context, rules);
            
            // 应用自定义路径
            const finalFilename = settings.downloadPath 
                ? `${settings.downloadPath}/${newFilename}` 
                : newFilename;
            
            // 执行下载
            chrome.downloads.download({
                url: info.srcUrl,
                filename: finalFilename,
                conflictAction: 'uniquify'
            });
            
        } catch (error) {
            console.error('下载处理失败:', error);
            // 失败时回退到原始下载
            chrome.downloads.download({
                url: info.srcUrl,
                filename: getFilenameFromUrl(info.srcUrl)
            });
        }
    }
});

// 监听下载确定文件名的事件（处理自动下载）
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    handleAutoDownload(downloadItem, suggest);
    return true;
});

async function handleAutoDownload(downloadItem, suggest) {
    try {
        // 获取设置
        const result = await chrome.storage.local.get(['settings', 'rules']);
        const settings = result.settings || { enableRename: true, downloadPath: '' };
        const rules = result.rules || [];
        
        if (!settings.enableRename) {
            return;
        }
        
        // 构建规则匹配上下文
        const context = {
            pageUrl: downloadItem.referrer || downloadItem.finalUrl,
            imageUrl: downloadItem.url,
            pageDomain: new URL(downloadItem.referrer || downloadItem.finalUrl).hostname,
            imageDomain: new URL(downloadItem.url).hostname,
            filename: downloadItem.filename
        };
        
        // 应用重命名规则
        let newFilename = applyRules(context, rules);
        
        // 应用自定义路径
        const finalFilename = settings.downloadPath 
            ? `${settings.downloadPath}/${newFilename}` 
            : newFilename;
        
        suggest({
            filename: finalFilename,
            conflictAction: 'uniquify'
        });
        
    } catch (error) {
        console.error('自动下载处理失败:', error);
    }
}

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
        
        // 确保有扩展名
        if (!/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename)) {
            filename += '.jpg';
        }
        
        return filename;
    } catch (e) {
        console.error('获取文件名失败:', e);
        return 'image_' + Date.now() + '.jpg';
    }
}

// 应用重命名规则的函数
function applyRules(context, rules) {
    let newFilename = context.filename;
    
    // 按顺序尝试每条规则
    for (const rule of rules) {
        if (!rule.enabled) continue;
        
        // 检查域名匹配（支持多种匹配方式）
        const domainMatch = isDomainMatch(context, rule.domain);
        
        if (domainMatch) {
            try {
                // 应用正则表达式替换
                const regex = new RegExp(rule.pattern, 'g');
                if (regex.test(newFilename) || regex.test(context.imageUrl) || regex.test(context.pageUrl)) {
                    // 先尝试在原文件名上应用规则
                    let tempResult = newFilename.replace(regex, rule.replacement);
                    
                    // 如果原文件名上没有变化，尝试在 URL 上应用规则
                    if (tempResult === newFilename) {
                        tempResult = context.imageUrl.replace(regex, rule.replacement);
                        // 从结果中提取文件名部分
                        const urlParts = tempResult.split('/');
                        tempResult = urlParts[urlParts.length - 1].split('?')[0];
                        
                        // 确保有扩展名
                        if (!/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(tempResult)) {
                            const ext = newFilename.split('.').pop();
                            tempResult += '.' + ext;
                        }
                    }
                    
                    newFilename = tempResult;
                    break; // 找到匹配规则后停止
                }
            } catch (e) {
                console.error('正则表达式错误:', e, '规则:', rule);
                continue; // 继续尝试下一个规则
            }
        }
    }
    
    return newFilename;
}

// 检查域名是否匹配的函数
function isDomainMatch(context, ruleDomain) {
    if (!ruleDomain) return false;
    
    // 支持多种匹配方式
    return context.pageDomain.includes(ruleDomain) || 
           context.imageDomain.includes(ruleDomain) ||
           context.pageUrl.includes(ruleDomain) ||
           context.imageUrl.includes(ruleDomain);
}

// 监听消息（用于 content script 通信）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'downloadWithRename') {
        handleDownloadRequest(message);
        return true; // 保持消息通道开放
    }
    return false;
});

async function handleDownloadRequest(message) {
    try {
        const result = await chrome.storage.local.get(['settings', 'rules']);
        const settings = result.settings || { enableRename: true, downloadPath: '' };
        const rules = result.rules || [];
        
        if (!settings.enableRename) {
            chrome.downloads.download({
                url: message.url,
                filename: settings.downloadPath ? 
                    `${settings.downloadPath}/${message.originalFilename}` : 
                    message.originalFilename
            });
            return;
        }
        
        // 构建规则匹配上下文
        const context = {
            pageUrl: message.pageUrl,
            imageUrl: message.url,
            pageDomain: new URL(message.pageUrl).hostname,
            imageDomain: new URL(message.url).hostname,
            filename: message.originalFilename
        };
        
        // 应用重命名规则
        let newFilename = applyRules(context, rules);
        
        // 应用自定义路径
        const finalFilename = settings.downloadPath 
            ? `${settings.downloadPath}/${newFilename}` 
            : newFilename;
        
        // 执行下载
        chrome.downloads.download({
            url: message.url,
            filename: finalFilename,
            conflictAction: 'uniquify'
        });
        
    } catch (error) {
        console.error('下载请求处理失败:', error);
        chrome.downloads.download({
            url: message.url,
            filename: message.originalFilename
        });
    }
}