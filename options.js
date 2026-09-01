// options.js

// --- Preset library (Plan 5) ---
const PRESETS = {
    twitter: {
        label: 'X / Twitter',
        domain: 'pbs.twimg.com',
        pattern: 'media\\/([A-Za-z0-9_-]+)',
        replacement: 'X_{date}_$1'
    },
    pixiv: {
        label: 'Pixiv',
        domain: 'i.pximg.net',
        pattern: '(\\d+)_p(\\d+)',
        replacement: 'pixiv_$1_p$2'
    },
    unsplash: {
        label: 'Unsplash',
        domain: 'images.unsplash.com',
        pattern: 'photo-([A-Za-z0-9_-]+)',
        replacement: 'unsplash_$1'
    },
    reddit: {
        label: 'Reddit',
        domain: 'i.redd.it',
        pattern: '([A-Za-z0-9]+)\\.(jpe?g|png|gif|webp)',
        replacement: 'reddit_{date}_$1.$2'
    },
    imgur: {
        label: 'Imgur',
        domain: 'i.imgur.com',
        pattern: '([A-Za-z0-9]+)\\.(jpe?g|png|gif|webp)',
        replacement: 'imgur_$1.$2'
    }
};

// --- Rule engine (mirrors background.js — kept in sync for the test panel, Plan 4) ---
function applyRules(context, rules) {
    let newFilename = context.filename;

    for (const rule of rules) {
        if (!rule.enabled) continue;
        if (!isDomainMatch(context, rule.domain)) continue;

        try {
            const regex = new RegExp(rule.pattern, 'g');

            const matchesFilename  = regex.test(newFilename);      regex.lastIndex = 0;
            const matchesImageUrl  = regex.test(context.imageUrl); regex.lastIndex = 0;
            const matchesPageUrl   = regex.test(context.pageUrl);  regex.lastIndex = 0;

            if (!matchesFilename && !matchesImageUrl && !matchesPageUrl) continue;

            let result = newFilename.replace(regex, rule.replacement);
            regex.lastIndex = 0;

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

            return { filename: resolveVariables(result, context), matchedRule: rule };
        } catch (e) {
            // invalid regex — skip rule
        }
    }

    return { filename: newFilename, matchedRule: null };
}

// Plan 7: proper hostname suffix matching
function isDomainMatch(context, ruleDomain) {
    if (!ruleDomain) return false;
    const match = (host) => host === ruleDomain || host.endsWith('.' + ruleDomain);
    return match(context.pageDomain) || match(context.imageDomain);
}

// Plan 6: variable substitution (counter always 1 in test panel)
function resolveVariables(str, context, counter = 1) {
    const date = new Date().toISOString().slice(0, 10);
    return str
        .replace(/\{date\}/g, date)
        .replace(/\{domain\}/g, context.imageDomain || context.pageDomain)
        .replace(/\{n\}/g, String(counter))
        .replace(/\{title\}/g, sanitizeForFilename(context.pageTitle || ''));
}

function sanitizeForFilename(str) {
    return str.replace(/[/\\:*?"<>|]/g, '_').slice(0, 50);
}

function buildTestContext(imageUrl, pageUrl, pageTitle) {
    let pageDomain = '', imageDomain = '';
    try { pageDomain = new URL(pageUrl).hostname; } catch {}
    try { imageDomain = new URL(imageUrl).hostname; } catch {}
    const pathname = (() => { try { return new URL(imageUrl).pathname; } catch { return imageUrl; } })();
    const filename = pathname.split('/').pop().split('?')[0] || 'image.jpg';
    return { pageUrl, imageUrl, pageDomain, imageDomain, filename, pageTitle };
}

// --- Options UI class ---
class SmartRenamerOptions {
    constructor() {
        this.init();
    }

    init() {
        this.loadSettings();
        this.loadRules();
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('saveBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetSettings());
        document.getElementById('addRule').addEventListener('click', () => this.addRule());
        document.getElementById('addPresetRule').addEventListener('click', () => this.addPresetRule());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportRules());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', (e) => this.importRules(e));
        document.getElementById('testRulesBtn').addEventListener('click', () => this.runTest());
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['settings']);
            const settings = result.settings || {};
            document.getElementById('enableRename').checked = settings.enableRename !== false;
            document.getElementById('downloadPath').value = settings.downloadPath || '';
        } catch (e) {
            console.error('加载设置失败:', e);
        }
    }

    async saveSettings() {
        try {
            const settings = {
                enableRename: document.getElementById('enableRename').checked,
                downloadPath: document.getElementById('downloadPath').value.trim()
            };
            const rules = this.getRulesFromUI();
            await chrome.storage.local.set({ settings, rules });
            this.showNotification('设置已保存', 'success');
        } catch (e) {
            this.showNotification('保存失败: ' + e.message, 'error');
        }
    }

    async resetSettings() {
        if (!confirm('确定要恢复默认设置吗？')) return;
        try {
            await chrome.storage.local.clear();
            location.reload();
        } catch (e) {
            this.showNotification('重置失败: ' + e.message, 'error');
        }
    }

    async loadRules() {
        try {
            const result = await chrome.storage.local.get(['rules']);
            const rules = result.rules || [];
            const container = document.getElementById('rulesContainer');
            container.innerHTML = '';
            rules.forEach((rule) => this.addRuleToUI(rule));
            if (rules.length === 0) this.addRuleToUI(PRESETS.twitter);
            this.updateEmptyHint();
        } catch (e) {
            console.error('加载规则失败:', e);
        }
    }

    addRule() {
        this.addRuleToUI({ domain: '', pattern: '', replacement: '', enabled: true });
        this.updateEmptyHint();
    }

    // Plan 5: add from curated preset dropdown
    addPresetRule() {
        const select = document.getElementById('presetSelect');
        const key = select.value;
        if (!key || !PRESETS[key]) {
            this.showNotification('请先从下拉菜单选择一个预设', 'error');
            return;
        }
        this.addRuleToUI({ ...PRESETS[key], enabled: true });
        select.value = '';
        this.updateEmptyHint();
        this.showNotification(`已添加 ${PRESETS[key].label} 预设规则`, 'success');
    }

    addRuleToUI(rule) {
        const template = document.getElementById('ruleTemplate');
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.miuix-rule-item');

        item.querySelector('.rule-enabled').checked = rule.enabled !== false;
        item.querySelector('.rule-domain').value = rule.domain || '';
        item.querySelector('.rule-pattern').value = rule.pattern || '';
        item.querySelector('.rule-replacement').value = rule.replacement || '';

        // Update label to show domain if set
        const domainInput = item.querySelector('.rule-domain');
        const titleEl = item.querySelector('.rule-title');
        const updateTitle = () => {
            titleEl.textContent = domainInput.value.trim() || '规则';
        };
        domainInput.addEventListener('input', updateTitle);
        updateTitle();

        item.querySelector('.delete-rule').addEventListener('click', () => {
            if (confirm('确定要删除这条规则吗？')) {
                item.remove();
                this.updateEmptyHint();
            }
        });
        item.querySelector('.move-up').addEventListener('click', () => {
            const prev = item.previousElementSibling;
            if (prev) item.parentElement.insertBefore(item, prev);
        });
        item.querySelector('.move-down').addEventListener('click', () => {
            const next = item.nextElementSibling;
            if (next) item.parentElement.insertBefore(next, item);
        });

        document.getElementById('rulesContainer').appendChild(item);
    }

    getRulesFromUI() {
        return [...document.querySelectorAll('.miuix-rule-item')]
            .map(item => ({
                enabled: item.querySelector('.rule-enabled').checked,
                domain: item.querySelector('.rule-domain').value.trim(),
                pattern: item.querySelector('.rule-pattern').value.trim(),
                replacement: item.querySelector('.rule-replacement').value.trim()
            }))
            .filter(r => r.domain && r.pattern && r.replacement);
    }

    updateEmptyHint() {
        const hint = document.getElementById('emptyRulesHint');
        const hasRules = document.querySelectorAll('.miuix-rule-item').length > 0;
        hint.style.display = hasRules ? 'none' : 'block';
    }

    // Plan 4: live rule test panel
    runTest() {
        const imageUrl = document.getElementById('testImageUrl').value.trim();
        const pageUrl  = document.getElementById('testPageUrl').value.trim() || 'https://example.com';
        const pageTitle = document.getElementById('testPageTitle').value.trim();
        const resultDiv = document.getElementById('testResult');

        if (!imageUrl) {
            this.showNotification('请输入图片 URL', 'error');
            return;
        }

        const rules = this.getRulesFromUI();
        const context = buildTestContext(imageUrl, pageUrl, pageTitle);
        const { filename, matchedRule } = applyRules(context, rules);

        resultDiv.style.display = 'block';
        if (matchedRule) {
            resultDiv.className = 'miuix-test-result miuix-test-result--match';
            resultDiv.innerHTML =
                `<strong>✓ 匹配规则</strong>：${escapeHtml(matchedRule.domain)}<br>` +
                `<strong>原始文件名</strong>：${escapeHtml(context.filename)}<br>` +
                `<strong>重命名结果</strong>：<code>${escapeHtml(filename)}</code>`;
        } else {
            resultDiv.className = 'miuix-test-result miuix-test-result--nomatch';
            resultDiv.innerHTML =
                `<strong>✗ 无规则匹配</strong><br>` +
                `<strong>原始文件名</strong>：${escapeHtml(context.filename)}（保持不变）`;
        }
    }

    // Plan 5: export rules as JSON file
    exportRules() {
        const rules = this.getRulesFromUI();
        if (rules.length === 0) {
            this.showNotification('没有可导出的规则', 'error');
            return;
        }
        const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'smart-renamer-rules.json';
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification(`已导出 ${rules.length} 条规则`, 'success');
    }

    // Plan 5: import rules from JSON file
    importRules(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (!Array.isArray(imported)) throw new Error('格式错误');
                const valid = imported.filter(r => r.domain && r.pattern && r.replacement);
                if (valid.length === 0) throw new Error('没有有效规则');

                if (confirm(`导入 ${valid.length} 条规则？（将追加到现有规则后）`)) {
                    valid.forEach(r => this.addRuleToUI({ ...r, enabled: r.enabled !== false }));
                    this.updateEmptyHint();
                    this.showNotification(`已导入 ${valid.length} 条规则`, 'success');
                }
            } catch (err) {
                this.showNotification('导入失败: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // reset so the same file can be re-imported
    }

    showNotification(message, type = 'info') {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 12px 16px;
            border-radius: 8px; color: white; font-size: 0.9rem; z-index: 1000;
            animation: fadeIn 0.3s ease;
            background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
        `;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => new SmartRenamerOptions());
