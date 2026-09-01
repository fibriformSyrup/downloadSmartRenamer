// background.js

// --- Settings cache (Plan 1: synchronous suggest) ---
let cachedSettings = { enableRename: true, downloadPath: '' };
let cachedRules = [];
let downloadCounter = 0; // {n} variable (Plan 6)

chrome.storage.local.get(['settings', 'rules'], (result) => {
    if (result.settings) cachedSettings = result.settings;
    if (result.rules) cachedRules = result.rules;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings?.newValue) cachedSettings = changes.settings.newValue;
    if (changes.rules?.newValue) cachedRules = changes.rules.newValue;
});

// --- Context menu ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'downloadWithSmartRename',
            title: '用 Smart Renamer 下载',
            contexts: ['image'],
            documentUrlPatterns: ['<all_urls>']
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'downloadWithSmartRename' || !info.srcUrl) return;

    if (!cachedSettings.enableRename) {
        chrome.downloads.download({
            url: info.srcUrl,
            filename: buildFinalPath(getFilenameFromUrl(info.srcUrl), cachedSettings)
        });
        return;
    }

    const context = buildContext({ pageUrl: tab.url, imageUrl: info.srcUrl, pageTitle: tab.title || '' });
    const newFilename = applyRules(context, cachedRules);
    chrome.downloads.download({
        url: info.srcUrl,
        filename: buildFinalPath(newFilename, cachedSettings),
        conflictAction: 'uniquify'
    });
});

// --- Auto-download intercept (Plan 1: synchronous using cache) ---
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    if (!cachedSettings.enableRename) return;

    // Plan 2 (bugfix): guard against empty/non-HTTP referrer
    const refRaw = downloadItem.referrer;
    const refUrl = (refRaw && refRaw.startsWith('http')) ? refRaw : downloadItem.finalUrl;

    let pageUrl;
    try { pageUrl = new URL(refUrl).href; } catch { return; }

    const context = buildContext({ pageUrl, imageUrl: downloadItem.url, pageTitle: '' });
    context.filename = downloadItem.filename || getFilenameFromUrl(downloadItem.url);

    const newFilename = applyRules(context, cachedRules);
    suggest({ filename: buildFinalPath(newFilename, cachedSettings), conflictAction: 'uniquify' });
});

// --- Helpers ---
function buildContext({ pageUrl, imageUrl, pageTitle = '' }) {
    let pageDomain = '';
    let imageDomain = '';
    try { pageDomain = new URL(pageUrl).hostname; } catch {}
    try { imageDomain = new URL(imageUrl).hostname; } catch {}
    return {
        pageUrl: pageUrl || '',
        imageUrl: imageUrl || '',
        pageDomain,
        imageDomain,
        filename: getFilenameFromUrl(imageUrl),
        pageTitle
    };
}

function buildFinalPath(filename, settings) {
    if (!settings.downloadPath) return filename;
    const dir = settings.downloadPath.replace(/\/+$/, '');
    return `${dir}/${filename}`;
}

function getFilenameFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        let filename = pathname.split('/').pop().split('?')[0];
        if (!filename) return 'image_' + Date.now() + '.jpg';
        // Only append extension if none present; preserve existing image extensions
        if (!/\.(jpe?g|png|gif|webp|bmp|svg|avif|tiff?)$/i.test(filename)) {
            filename += '.jpg';
        }
        return filename;
    } catch {
        return 'image_' + Date.now() + '.jpg';
    }
}

// --- Rule engine ---
function applyRules(context, rules) {
    let newFilename = context.filename;

    for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!isDomainMatch(context, rule.domain)) continue;

        try {
            const regex = new RegExp(rule.pattern, 'g');

            const matchesFilename = regex.test(newFilename); regex.lastIndex = 0;
            const matchesImageUrl = regex.test(context.imageUrl); regex.lastIndex = 0;
            const matchesPageUrl  = regex.test(context.pageUrl);  regex.lastIndex = 0;

            if (!matchesFilename && !matchesImageUrl && !matchesPageUrl) continue;

            let result = newFilename.replace(regex, rule.replacement);
            regex.lastIndex = 0;

            // No change on filename — try extracting from imageUrl
            if (result === newFilename && matchesImageUrl) {
                const urlResult = context.imageUrl.replace(regex, rule.replacement);
                regex.lastIndex = 0;
                let extracted = urlResult.split('/').pop().split('?')[0];
                if (!/\.(jpe?g|png|gif|webp|bmp|svg|avif|tiff?)$/i.test(extracted)) {
                    const ext = newFilename.split('.').pop();
                    if (ext) extracted += '.' + ext;
                }
                result = extracted;
            }

            newFilename = resolveVariables(result, context);
            break; // first matching rule wins
        } catch (e) {
            console.error('Rule error:', e, rule);
        }
    }

    return newFilename;
}

// Plan 7: proper hostname suffix matching (prevents "twitter.com" matching "nottwitter.com")
function isDomainMatch(context, ruleDomain) {
    if (!ruleDomain) return false;
    const match = (host) => host === ruleDomain || host.endsWith('.' + ruleDomain);
    return match(context.pageDomain) || match(context.imageDomain);
}

// Plan 6: {date}, {domain}, {n}, {title} variable substitution
function resolveVariables(str, context) {
    const date = new Date().toISOString().slice(0, 10);
    downloadCounter++;
    return str
        .replace(/\{date\}/g, date)
        .replace(/\{domain\}/g, context.imageDomain || context.pageDomain)
        .replace(/\{n\}/g, String(downloadCounter))
        .replace(/\{title\}/g, sanitizeForFilename(context.pageTitle || ''));
}

function sanitizeForFilename(str) {
    return str.replace(/[/\\:*?"<>|]/g, '_').slice(0, 50);
}

// --- Content script messages (Plan 2: use originalUrl for rule matching) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'downloadWithRename') {
        handleDownloadRequest(message);
        return true;
    }
    return false;
});

function handleDownloadRequest(message) {
    // Use the real image URL for rule matching, not the blob URL (Plan 2)
    const ruleUrl = message.originalUrl || message.url;

    if (!cachedSettings.enableRename) {
        chrome.downloads.download({
            url: message.url,
            filename: buildFinalPath(message.originalFilename, cachedSettings)
        });
        return;
    }

    const context = buildContext({
        pageUrl: message.pageUrl || '',
        imageUrl: ruleUrl,
        pageTitle: message.pageTitle || ''
    });
    context.filename = message.originalFilename;

    const newFilename = applyRules(context, cachedRules);
    chrome.downloads.download({
        url: message.url, // still download via blob URL
        filename: buildFinalPath(newFilename, cachedSettings),
        conflictAction: 'uniquify'
    });
}
