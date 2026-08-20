// options.js
class MiuixOptions {
    constructor() {
        this.init();
    }

    init() {
        this.loadSettings();
        this.bindEvents();
        this.loadRules();
        
        // 添加默认规则提示
        this.addDefaultRuleHint();
    }

    bindEvents() {
        // 保存按钮
        document.getElementById('saveBtn').addEventListener('click', () => this.saveSettings());
        
        // 重置按钮
        document.getElementById('resetBtn').addEventListener('click', () => this.resetSettings());
        
        // 添加规则按钮
        document.getElementById('addRule').addEventListener('click', () => this.addRule());
        
        // 添加预设规则按钮
        document.getElementById('addPresetRule').addEventListener('click', () => this.addPresetRule());
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['settings']);
            const settings = result.settings || {};
            
            document.getElementById('enableRename').checked = settings.enableRename !== false;
            document.getElementById('downloadPath').value = settings.downloadPath || '';
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    async saveSettings() {
        try {
            // 保存基础设置
            const settings = {
                enableRename: document.getElementById('enableRename').checked,
                downloadPath: document.getElementById('downloadPath').value
            };

            // 保存规则
            const rules = this.getRulesFromUI();
            
            await Promise.all([
                chrome.storage.local.set({ settings }),
                chrome.storage.local.set({ rules })
            ]);

            // 显示成功提示
            this.showNotification('设置已保存', 'success');
        } catch (error) {
            console.error('保存设置失败:', error);
            this.showNotification('保存失败: ' + error.message, 'error');
        }
    }

    async resetSettings() {
        if (confirm('确定要恢复默认设置吗？')) {
            try {
                await chrome.storage.local.clear();
                location.reload();
            } catch (error) {
                console.error('重置设置失败:', error);
                this.showNotification('重置失败: ' + error.message, 'error');
            }
        }
    }

    async loadRules() {
        try {
            const result = await chrome.storage.local.get(['rules']);
            const rules = result.rules || [];
            
            // 清空现有规则
            const container = document.getElementById('rulesContainer');
            container.innerHTML = '';
            
            // 添加规则
            rules.forEach((rule, index) => {
                this.addRuleToUI(rule, index);
            });

            // 如果没有规则，添加默认规则
            if (rules.length === 0) {
                this.addXRule();
            }
        } catch (error) {
            console.error('加载规则失败:', error);
        }
    }

    addRule() {
        const rule = {
            domain: '',
            pattern: '',
            replacement: '',
            enabled: true
        };
        this.addRuleToUI(rule);
    }

    // 添加 X/Twitter 规则
    addXRule() {
        const rule = {
            domain: 'pbs.twimg.com',
            pattern: 'media\\/([A-Za-z0-9]+)',
            replacement: 'X_$1',
            enabled: true
        };
        this.addRuleToUI(rule);
    }

    // 添加预设规则
    addPresetRule() {
        const preset = {
            domain: 'pbs.twimg.com',
            pattern: 'GuSiiutakAAFmP8',
            replacement: 'GC_Conceptart_2054594357018157401',
            enabled: true
        };
        this.addRuleToUI(preset);
    }

    addRuleToUI(rule, index = null) {
        const template = document.getElementById('ruleTemplate');
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.miuix-rule-item');
        
        // 设置初始值
        const enabledInput = item.querySelector('.rule-enabled');
        const domainInput = item.querySelector('.rule-domain');
        const patternInput = item.querySelector('.rule-pattern');
        const replacementInput = item.querySelector('.rule-replacement');

        enabledInput.checked = rule.enabled !== false;
        domainInput.value = rule.domain || '';
        patternInput.value = rule.pattern || '';
        replacementInput.value = rule.replacement || '';

        // 绑定事件
        this.bindRuleEvents(item, rule, index);

        // 添加到容器
        document.getElementById('rulesContainer').appendChild(item);
    }

    bindRuleEvents(item, rule, index) {
        // 删除规则
        item.querySelector('.delete-rule').addEventListener('click', () => {
            if (confirm('确定要删除这条规则吗？')) {
                item.remove();
            }
        });

        // 上移规则
        item.querySelector('.move-up').addEventListener('click', () => {
            const parent = item.parentElement;
            const prev = item.previousElementSibling;
            if (prev) {
                parent.insertBefore(item, prev);
            }
        });

        // 下移规则
        item.querySelector('.move-down').addEventListener('click', () => {
            const parent = item.parentElement;
            const next = item.nextElementSibling;
            if (next) {
                parent.insertBefore(next, item);
            }
        });
    }

    getRulesFromUI() {
        const rules = [];
        const items = document.querySelectorAll('.miuix-rule-item');
        
        items.forEach(item => {
            const rule = {
                enabled: item.querySelector('.rule-enabled').checked,
                domain: item.querySelector('.rule-domain').value.trim(),
                pattern: item.querySelector('.rule-pattern').value.trim(),
                replacement: item.querySelector('.rule-replacement').value.trim()
            };
            
            if (rule.domain && rule.pattern && rule.replacement) {
                rules.push(rule);
            }
        });

        return rules;
    }

    addDefaultRuleHint() {
        const sectionHeader = document.querySelector('.miuix-section-header');
        if (sectionHeader) {
            const hintButton = document.createElement('button');
            hintButton.className = 'miuix-button miuix-button-secondary';
            hintButton.id = 'addPresetRule';
            hintButton.textContent = '添加 X 规则';
            hintButton.title = '为 X/Twitter 图片添加预设规则';
            
            sectionHeader.insertBefore(hintButton, sectionHeader.firstChild.nextSibling);
        }
    }

    showNotification(message, type = 'info') {
        // 简单的通知显示
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 8px;
            color: white;
            font-size: 0.9rem;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            ${type === 'error' ? 'background: #dc3545;' : 
              type === 'success' ? 'background: #28a745;' : 'background: #007bff;'}
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new MiuixOptions();
});