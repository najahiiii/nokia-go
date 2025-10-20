// Add this to your existing JavaScript code or create a new script

class TabSwitcher {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) return;

        this.tabs = this.container.querySelectorAll('ul li a');
        this.tabContents = this.container.querySelectorAll('div[id]');

        this.init();
    }

    init() {
        // Hide all tab contents except the first one
        this.tabContents.forEach((content, index) => {
            content.style.display = index === 0 ? 'block' : 'none';
        });

        // Add click event listeners to tabs
        this.tabs.forEach((tab, index) => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(index);
            });
        });
    }

    switchTab(tabIndex) {
        // Update tab appearance
        this.tabs.forEach((tab, index) => {
            if (index === tabIndex) {
                tab.classList.add('text-white', 'bg-blue-600');
                tab.classList.remove('text-[#c8c8c8]', 'hover:text-gray-300', 'hover:bg-gray-700');
                tab.setAttribute('aria-current', 'page');
            } else {
                tab.classList.remove('text-white', 'bg-blue-600');
                tab.classList.add('text-[#c8c8c8]', 'hover:text-gray-300', 'hover:bg-gray-700');
                tab.removeAttribute('aria-current');
            }
        });

        // Update tab content visibility
        this.tabContents.forEach((content, index) => {
            content.style.display = index === tabIndex ? 'block' : 'none';
        });
    }
}

// Initialize the tab switcher when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TabSwitcher('article[aria-labelledby="settings-title"]');
});
