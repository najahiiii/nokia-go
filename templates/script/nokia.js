// API Client Utilities
const API = {
    baseUrl: `${window.location.origin}/api`,
    // baseUrl: "http://192.168.1.69:5000/api",

    async fetchData(endpoint, args = "") {
        const url = `${this.baseUrl}/${endpoint}${args ? '?' + args : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
            let message = `HTTP error! status: ${response.status}`;
            try {
                const errorPayload = await response.json();
                if (errorPayload?.error) {
                    message = errorPayload.error;
                }
            } catch (_) {
                // ignore body parse issues
            }
            throw new Error(message);
        }

        return await response.json();
    },

    async sendJSON(endpoint, payload, method = "POST") {
        const response = await fetch(`${this.baseUrl}/${endpoint}`, {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let message = `HTTP error! status: ${response.status}`;
            try {
                const errorPayload = await response.json();
                if (errorPayload?.error) {
                    message = errorPayload.error;
                }
            } catch (_) {
                // ignore JSON parsing errors
            }
            throw new Error(message);
        }

        try {
            return await response.json();
        } catch (_) {
            return {};
        }
    },

    getFormattedDailyUsage() {
        return this.fetchData('daily_usage');
    },

    getPreloginStatus() {
        return this.fetchData('prelogin_status');
    },

    getOverview() {
        return this.fetchData('overview');
    },

    getWanStatus() {
        return this.fetchData('wan_status');
    },

    getDeviceStatus() {
        return this.fetchData('device_status');
    },

    getNetworkClients() {
        return this.fetchData('network_clients');
    },

    getServiceData() {
        return this.fetchData('service_data');
    },

    getStatusWeb() {
        return this.fetchData('status_web');
    },

    getCurrentLedState() {
        return this.fetchData('led_state');
    },

    setLedState(enable) {
        return this.sendJSON('led_state', { enable });
    },

    setApnInternet(apn) {
        return this.fetchData('set_apn', `apn=${encodeURIComponent(apn)}`);
    },

    doReboot() {
        return this.fetchData('do_reboot');
    },

    getLanStatus() {
        return this.fetchData('lan_status');
    },

    getWlan24gStatus() {
        return this.fetchData('wlan_configs_24g');
    },

    getWlan5gStatus() {
        return this.fetchData('wlan_configs_5g');
    },

    getSmsList() {
        return this.fetchData('sms');
    },

    setSmsState(smsid, smsunread) {
        return this.fetchData('set_sms_state', `smsid=${encodeURIComponent(smsid)}&smsunread=${encodeURIComponent(smsunread)}`);
    },

    deleteSms(smsids, options = {}) {
        const ids = Array.isArray(smsids) ? smsids : (smsids === undefined ? [] : [smsids]);
        const cleaned = ids
            .map((id) => typeof id === 'number' ? String(id) : (id ?? '').toString())
            .map((id) => id.trim())
            .filter((id) => id.length > 0);

        const payload = {};
        if (cleaned.length > 0) {
            payload.sms_ids = cleaned;
        }
        if (options.deleteAll) {
            payload.delete_all = true;
        }

        if (!payload.delete_all && !payload.sms_ids) {
            return Promise.reject(new Error('No SMS IDs provided'));
        }
        return this.sendJSON('delete_sms', payload);
    },

    getCellularIdentity() {
        return this.fetchData('cell_identification');
    },

    getDataExpired() {
        return this.fetchData('get_data_expired');
    },

    setDataExpired(data_expired) {
        return this.fetchData('set_data_expired', `data_expired=${encodeURIComponent(data_expired)}`);
    },

    getConfig() {
        return this.fetchData('config');
    },

    updateConfig(config) {
        return this.sendJSON('config', config);
    },

    checkListener(host, port) {
        const params = new URLSearchParams();
        if (host !== undefined && host !== null) {
            params.set('host', host);
        }
        if (port !== undefined && port !== null) {
            params.set('port', port);
        }
        return this.fetchData('config/listener_available', params.toString());
    }
};

// DOM Utilities
const DOM = {
    escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    updateSignalBars(strength) {
        // Validate and normalize strength (0-5, where 5 is strongest)
        strength = Math.max(0, Math.min(5, Math.floor(strength)));

        // Update all bars at once
        document.querySelectorAll('.signal-bar').forEach((bar, index) => {
            const isActive = index < (5 - strength);
            bar.setAttribute('fill', isActive ? '#666666' : '#6495ed');
            bar.setAttribute('opacity', isActive ? '0.4' : '1');
        });
    },

    formatUptime(seconds) {
        const units = [
            { value: 86400, singular: 'day', plural: 'days' },
            { value: 3600, singular: 'hr', plural: 'hrs' },
            { value: 60, singular: 'min', plural: 'mins' },
            { value: 1, singular: 'sec', plural: 'secs' }
        ];

        return units.reduce((parts, unit) => {
            const count = Math.floor(seconds / unit.value);
            if (count > 0 || parts.length === 0) {
                parts.push(`${count} ${count === 1 ? unit.singular : unit.plural}`);
                seconds %= unit.value;
            }
            return parts;
        }, []).join(' ');
    },

    updateProgressBar(elementId, currentValue, minValue, maxValue, invertColor = false) {
        const progressElement = document.getElementById(elementId);
        if (!progressElement) return;

        const percentage = Math.max(0, Math.min(100,
            ((currentValue - minValue) / (maxValue - minValue)) * 100
        ));

        progressElement.style.width = `${percentage}%`;

        let colorClass;
        if (invertColor) {
            colorClass =
                percentage > 75 ? 'bg-red-500' :
                percentage > 45 ? 'bg-yellow-500' : 'bg-green-500';
        } else {
            colorClass =
                percentage > 75 ? 'bg-green-500' :
                percentage > 45 ? 'bg-yellow-500' : 'bg-red-500';
        }

        progressElement.className = `h-4 rounded-full transition-all duration-300 ${colorClass}`;
    },

    updateSignalStats(data) {
        if (!data.cell_LTE_stats_cfg?.[0]?.stat) return;

        const stats = data.cell_LTE_stats_cfg[0].stat;

        this.updateSignalBars(stats.RSRPStrengthIndexCurrent);

        // Update signal metrics
        this.setTextContent('radioRSSI', `${stats.RSSICurrent} dBm`);
        this.updateProgressBar('rssiProgress', stats.RSSICurrent, -120, -30);

        this.setTextContent('radioRSRP', `${stats.RSRPCurrent} dBm`);
        this.updateProgressBar('rsrpProgress', stats.RSRPCurrent, -140, -64);

        this.setTextContent('radioSNR', `${stats.SNRCurrent} dB`);
        this.updateProgressBar('sinrProgress', stats.SNRCurrent, -10, 30);

        this.setTextContent('radioRSRQ', `${stats.RSRQCurrent} dBm`);
        this.updateProgressBar('rsrqProgress', stats.RSRQCurrent, -20, -3);
    },

    updateNetworkInfo(data) {
        if (data.ntwtopo_cfg?.[0]) {
            this.setTextContent('routerIp', data.ntwtopo_cfg[0].IPAddress);
        }

        if (data.wan_conns?.[0]?.ipConns?.[0]) {
            const ipv4 = data.wan_conns[0].ipConns[0].ExternalIPAddress || 'Unavailable';
            this.setTextContent('wanIp', ipv4);
            this.setTextContent('wanIpPreview', ipv4);
        }

        if (data.wan_conns?.[0]?.ipConns?.[0]) {
            const dnsList = (data.wan_conns[0].ipConns[0].DNSServers || '')
                .split(/[\s,]+/)
                .map((dns) => dns.trim())
                .filter(Boolean);
            const dnsContainer = document.getElementById('dnsServer');
            if (dnsContainer) {
                if (dnsList.length === 0) {
                    dnsContainer.innerHTML = `
                        <span class="font-semibold text-xs">DNS Server</span>
                        <div class="flex flex-col text-right text-xs text-gray-400">Not provided</div>
                    `;
                } else {
                    dnsContainer.innerHTML = `
                        <span class="font-semibold text-xs">DNS Server</span>
                        <div class="flex flex-col text-right">
                            ${dnsList.map(dns => `<span class="font-semibold text-xs">${this.escapeHtml(dns)}</span>`).join('')}
                        </div>
                    `;
                }
            }
        }
    },

    updateDeviceStatus(data) {
        const total = data.mem_info?.Total ?? 1;
        const free = data.mem_info?.Free ?? 0;
        const used = total - free;

        this.setTextContent('uptime', this.formatUptime(data.UpTime));
        this.setTextContent('cpuUsage', `${data.cpu_usageinfo?.CPUUsage ?? '-'}%`);
        this.updateProgressBar('cpuUsageBar', data.cpu_usageinfo?.CPUUsage ?? 0, 0, 100, true);

        this.setTextContent('memUsage', `${Math.round((used / total) * 100)}%`);
        this.updateProgressBar('memUsageBar', used, 0, total, true);
    },

    setTextContent(id, text) {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    },

    updateConnectedStatus(data) {
        let lanConnected = 0;
        let wifiConnected = 0;

        for (const device of data.device_cfg) {
            if (device.InterfaceType === "Ethernet" && device.Active === 1) {
                lanConnected++;
            } else {
                wifiConnected++;
            }
        }

        document.getElementById('totalWiFiConnected').innerHTML = wifiConnected;
        document.getElementById('totalLANConnected').innerHTML = lanConnected;
    },

    updateLanStatus(data) {
        const deviceList = document.getElementById('deviceList');
        deviceList.innerHTML = ''; // Cleanup exist
        if (!deviceList) return; // Exit if element not found

        let htmlFragments = []; // Store HTML fragments for batch insertion

        for (const device of data.device_cfg) {
            let deviceAlias = device.MACAddress; // Default to MAC if no alias found
            let deviceCategory = "OTHER";

            // Find matching alias (if any)
            if (data.alias_cfg) {
                for (const alias of data.alias_cfg) {
                    if (alias.MACAddress === device.MACAddress) {
                        deviceAlias = alias.HostName;
                        deviceCategory = alias.DeviceCategory;
                        break; // Stop searching once a match is found
                    }
                }
            }

            let icon = `<svg width="36" height="36" viewBox="0 0 56 57" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" rx="28" fill="var(--pure-color-primary-10)"></rect><path d="M50.4866 11.3203C41.2746 -1.09768 23.741 -3.69888 11.3202 5.51032C1.39976 12.8687 -2.25424 25.5387 1.36896 36.6687H54.6222C57.327 28.3471 56.0978 18.8859 50.4866 11.3203Z" fill="var(--pure-color-primary-20)"></path><path d="M1.36914 36.6687C2.28194 39.4715 3.65674 42.1791 5.51034 44.6795C14.7223 57.1003 32.2587 59.7015 44.6767 50.4895C49.5319 46.8887 52.8863 42.0139 54.6223 36.6715H1.36914V36.6687Z" fill="var(--pure-color-primary-10)"></path><path d="M20.8604 12.5999C20.8604 11.6721 21.6125 10.9199 22.5404 10.9199H43.8204C44.7482 10.9199 45.5004 11.6721 45.5004 12.5999V43.3999C45.5004 44.3278 44.7482 45.0799 43.8204 45.0799H22.5404C21.6125 45.0799 20.8604 44.3278 20.8604 43.3999V12.5999Z" fill="var(--pure-color-primary-90)"></path><path opacity="0.1" d="M30.3799 42.5851C30.3799 42.4143 30.5199 42.2771 30.6879 42.2771H35.5067C35.6775 42.2771 35.8147 42.4171 35.8147 42.5851C35.8147 42.7559 35.6747 42.8931 35.5067 42.8931H30.6879C30.5171 42.8903 30.3799 42.7559 30.3799 42.5851Z" fill="var(--pure-color-primary-10)"></path><path opacity="0.05" d="M20.8516 12.5803L20.79 40.7119L39.7376 10.9787L23.0748 10.9563C21.8372 10.9563 20.8516 11.6731 20.8516 12.5803Z" fill="var(--pure-color-primary-10)"></path><path opacity="0.1" d="M21.4199 45.08H27.8568C28.4506 45.08 28.9491 44.5672 28.9491 43.9627L28.9799 22.6944C28.9799 22.0699 28.4954 21.5771 27.8876 21.5771L21.4199 21.5772V45.08Z" fill="var(--pure-color-black)"></path><path d="M27.0143 45.1079L17.4719 45.0911C16.8643 45.0911 16.3799 44.6095 16.3799 43.9991L16.4107 23.2119C16.4107 22.6043 16.8951 22.1199 17.5027 22.1199L27.0451 22.1367C27.6527 22.1367 28.1371 22.6183 28.1371 23.2287L28.1063 44.0159C28.1063 44.6067 27.6079 45.1079 27.0143 45.1079Z" fill="var(--pure-color-primary-70)"></path><path opacity="0.1" d="M21.3691 23.7525C21.3691 23.6153 21.4811 23.5061 21.6155 23.5061H23.1023C23.2395 23.5061 23.3487 23.6181 23.3487 23.7525C23.3487 23.8897 23.2367 23.9989 23.1023 23.9989H21.6155C21.4811 23.9989 21.3691 23.8869 21.3691 23.7525Z" fill="var(--pure-color-primary-10)"></path><path opacity="0.03" d="M16.4615 23.268L16.4307 42.014L25.0547 22.1928L17.5535 22.176C16.9459 22.176 16.4615 22.6576 16.4615 23.268Z" fill="var(--pure-color-primary-10)"></path><path opacity="0.1" fill-rule="evenodd" clip-rule="evenodd" d="M14.2347 30.2791H18.3227C18.544 30.2791 18.726 30.4079 18.7792 30.6039L18.8949 33.6169C19.9503 34.3241 20.7424 35.4271 21.0278 36.7673C21.4951 38.9611 20.4594 41.1201 18.6181 42.1753L18.53 44.7886C18.4936 44.9734 18.3228 45.1134 18.1128 45.1134H14.2292C14.0192 45.1134 13.8484 44.9846 13.798 44.7886L13.704 42.2231C12.4512 41.5403 11.4917 40.3348 11.1714 38.8325C10.6943 36.5924 11.7821 34.3889 13.6974 33.3594L13.7952 30.6039C13.8344 30.4191 14.0135 30.2791 14.2347 30.2791Z" fill="var(--pure-color-black)"></path><path d="M13.3957 30.2791H17.4837C17.7049 30.2791 17.8869 30.4079 17.9401 30.6039L18.1221 35.3415H12.7881L12.9561 30.6039C12.9953 30.4191 13.1745 30.2791 13.3957 30.2791Z" fill="var(--pure-color-primary-40)"></path><path d="M17.2736 45.1022H13.39C13.18 45.1022 13.0092 44.9734 12.9588 44.7774L12.7852 40.0398H17.8504L17.6908 44.7774C17.6544 44.9622 17.4836 45.1022 17.2736 45.1022Z" fill="var(--pure-color-primary-40)"></path><path d="M16.2905 42.3052C18.8105 41.7732 20.4205 39.2784 19.8829 36.7332C19.3453 34.188 16.8673 32.5584 14.3445 33.0904C11.8217 33.6224 10.2145 36.1172 10.7521 38.6624C11.2897 41.2048 13.7705 42.8372 16.2905 42.3052Z" fill="var(--pure-color-primary-90)"></path><path opacity="0.03" d="M14.3474 33.0904C11.8246 33.6224 10.2174 36.1172 10.755 38.6624C10.9986 39.8216 11.6482 40.7932 12.5218 41.454L17.251 33.418C16.3718 33.012 15.361 32.8748 14.3474 33.0904Z" fill="var(--pure-color-primary-10)"></path></svg>`;
            if (deviceCategory == "SERVER") {
                icon = `<svg width="36" height="36" viewBox="0 0 56 57" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="56" height="56" rx="28" fill="var(--pure-color-primary-20)"></rect><path d="M50.4866 11.3204C41.2746 -1.09756 23.741 -3.69876 11.3202 5.51044C1.39976 12.8688 -2.25424 25.5388 1.36896 36.6688H54.6222C57.327 28.3472 56.0978 18.886 50.4866 11.3204Z" fill="var(--pure-color-primary-20)"></path><path d="M1.36914 36.6688C2.28194 39.4716 3.65674 42.1792 5.51034 44.6796C14.7223 57.1004 32.2587 59.7016 44.6767 50.4896C49.5319 46.8888 52.8863 42.014 54.6223 36.6716H1.36914V36.6688Z" fill="var(--pure-color-primary-10)"></path><path d="M39.2505 10.92C39.6866 10.92 40.04 11.4762 40.04 12.1622L40.04 43.8379C40.04 44.5239 39.6866 45.08 39.2505 45.08L16.7495 45.08C16.3135 45.08 15.96 44.5239 15.96 43.8379L15.96 12.1622C15.96 11.4762 16.3135 10.92 16.7495 10.92L39.2505 10.92Z" fill="var(--pure-color-primary-70)"></path><path d="M37.8799 21.4241C37.8799 21.6538 37.6558 21.8401 37.3795 21.8401L18.7001 21.8401C18.4237 21.8401 18.1997 21.6538 18.1997 21.4241L18.1997 18.6161C18.1997 18.3863 18.4237 18.2001 18.7001 18.2001L37.3795 18.2001C37.6558 18.2001 37.8799 18.3863 37.8799 18.6161L37.8799 21.4241Z" fill="var(--pure-color-primary-100)"></path><path d="M37.8799 27.3041C37.8799 27.5338 37.6558 27.7201 37.3795 27.7201L18.7001 27.7201C18.4237 27.7201 18.1997 27.5338 18.1997 27.3041L18.1997 24.4961C18.1997 24.2663 18.4237 24.0801 18.7001 24.0801L37.3795 24.0801C37.6558 24.0801 37.8799 24.2663 37.8799 24.4961L37.8799 27.3041Z" fill="var(--pure-color-primary-100)"></path><path d="M37.8799 33.1841C37.8799 33.4138 37.6558 33.6001 37.3795 33.6001L18.7001 33.6001C18.4237 33.6001 18.1997 33.4138 18.1997 33.1841L18.1997 30.3761C18.1997 30.1463 18.4237 29.9601 18.7001 29.9601L37.3795 29.9601C37.6558 29.9601 37.8799 30.1463 37.8799 30.3761L37.8799 33.1841Z" fill="var(--pure-color-primary-100)"></path><path d="M37.8799 39.0641C37.8799 39.2939 37.6558 39.4801 37.3795 39.4801L18.7001 39.4801C18.4237 39.4801 18.1997 39.2939 18.1997 39.0641L18.1997 36.2561C18.1997 36.0264 18.4237 35.8401 18.7001 35.8401L37.3795 35.8401C37.6558 35.8401 37.8799 36.0264 37.8799 36.2561L37.8799 39.0641Z" fill="var(--pure-color-primary-100)"></path><path d="M37.7998 15.26C37.7998 15.8013 37.3611 16.24 36.8198 16.24C36.2786 16.24 35.8398 15.8013 35.8398 15.26C35.8398 14.7188 36.2786 14.28 36.8198 14.28C37.3611 14.28 37.7998 14.7188 37.7998 15.26Z" fill="var(--pure-color-primary-10)"></path></svg>`;
            }

            // Build HTML fragment
            htmlFragments.push(`
                <div role="listitem" class="flex items-center gap-3 py-3 border-b border-gray-600 last:border-b-0">
                    <div aria-hidden="true" class="bg-[#333] rounded-full w-9 h-9 flex justify-center items-center text-gray-400 text-lg">
                        ${icon}
                    </div>
                    <div>
                        <div class="font-semibold text-sm text-[#e5e5e5]">${deviceAlias}</div>
                        <div class="text-xs text-[#c8c8c8] flex items-center gap-1">
                            <span aria-hidden="true" class="w-2 h-2 rounded-full block bg-[#2e7d32]"></span>
                            ${device.IPAddress}
                        </div>
                    </div>
                    <div aria-label="WAN IP" class="font-bold text-xs text-[#e5e5e5] ml-auto">
                        ${deviceCategory}
                    </div>
                </div>
            `);
        }

        // Insert all HTML at once (better performance)
        deviceList.insertAdjacentHTML('beforeend', htmlFragments.join(''));
    },

    updateWlanStatus(data) {
        const wlanList = document.getElementById('wlanList');

        // Clear existing content before adding new items
        wlanList.innerHTML = '';

        if (data?.wlan_config_glb?.[0]) {
            const wlanConfig = data.wlan_config_glb[0];
            const checked = wlanConfig.Enable ? 'checked' : '';
            const html = `
                <div class="relative cursor-pointer mb-3">
                    <div aria-label="WiFi network ${wlanConfig.SSID}, Home Network - 2.4 GHz"
                         class="bg-[#333] rounded-xl p-3.5 font-semibold text-sm text-[#EDEDED] w-full pr-12">
                        ${wlanConfig.SSID}
                        <div class="font-normal text-xs text-[#EDEDED] mt-1">
                            Home Network - 2.4 GHz
                        </div>
                    </div>
                    <label class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-5 cursor-pointer">
                        <input type="checkbox" ${checked} class="sr-only peer">
                        <div class="relative w-9 h-5 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>`;

            wlanList.insertAdjacentHTML('beforeend', html);
        }

        if (data?.wlan_config_glb11ac?.[0]) {
            const wlanConfig = data.wlan_config_glb11ac[0];
            const checked = wlanConfig.Enable ? 'checked' : '';
            const html = `
                <div class="relative cursor-pointer mb-3">
                    <div aria-label="WiFi network ${wlanConfig.SSID}, Home Network - 5 GHz"
                         class="bg-[#333] rounded-xl p-3.5 font-semibold text-sm text-[#EDEDED] w-full pr-12">
                        ${wlanConfig.SSID}
                        <div class="font-normal text-xs text-[#EDEDED] mt-1">
                            Home Network - 5 GHz
                        </div>
                    </div>
                    <label class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-5 cursor-pointer">
                        <input type="checkbox" ${checked} class="sr-only peer">
                        <div class="relative w-9 h-5 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>`;

            wlanList.insertAdjacentHTML('beforeend', html);
        }
    },

    updateStatusWeb(data) {
        if (data.cell_LTE_stats_cfg?.[0]) {
            this.setTextContent('mainBand', data.cell_LTE_stats_cfg[0].stat.Band);
            this.setTextContent('mainPci', data.cell_LTE_stats_cfg[0].stat.PhysicalCellID);
            this.setTextContent('mainEarfcn', data.cell_LTE_stats_cfg[0].stat.DownlinkEarfcn);
            this.setTextContent('mainEci', data.cell_LTE_stats_cfg[0].stat.ECI);
        }
    },

    updateServiceInfo(data) {
        const downlinkContainer = document.getElementById('downlink');
        const uplinkContainer = document.getElementById('uplink');

        downlinkContainer.innerHTML = '';
        uplinkContainer.innerHTML = '';

        if (data?.FunctionResult?.LTEDLCA) {
            const lteData = Array.isArray(data.FunctionResult.LTEDLCA)
                ? data.FunctionResult.LTEDLCA
                : Object.values(data.FunctionResult.LTEDLCA);

            // For each item in LTEDLCA, create the HTML layout
            lteData.forEach((x, index) => {
                const html = `
                    <div class="carrier-section mb-4">
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">Band</span>
                            <span class="font-semibold text-xs">${x.ScellBand || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">Bandwidth</span>
                            <span class="font-semibold text-xs">${x.ScellBandwidth || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">PCI</span>
                            <span class="font-semibold text-xs">${x.PhysicalCellID || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">EARFCN</span>
                            <span class="font-semibold text-xs">${x.ScellChannel || 'N/A'}</span>
                        </div>
                        ${index < lteData.length - 1 ? '<hr class="border-t border-gray-600 mb-3">' : ''}
                    </div>
                `;

                downlinkContainer.insertAdjacentHTML('beforeend', html);
            });
        }

        if (data?.FunctionResult?.LTEULCA) {
            const lteData = Array.isArray(data.FunctionResult.LTEULCA)
                ? data.FunctionResult.LTEULCA
                : Object.values(data.FunctionResult.LTEULCA);

            // For each item in LTEULCA, create the HTML layout
            lteData.forEach((x, index) => {
                const html = `
                    <div class="carrier-section mb-4">
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">Band</span>
                            <span class="font-semibold text-xs">${x.ScellBand || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">Bandwidth</span>
                            <span class="font-semibold text-xs">${x.ScellBandwidth || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">PCI</span>
                            <span class="font-semibold text-xs">${x.PhysicalCellID || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between py-1 mb-2">
                            <span class="font-semibold text-xs">EARFCN</span>
                            <span class="font-semibold text-xs">${x.ScellChannel || 'N/A'}</span>
                        </div>
                        ${index < lteData.length - 1 ? '<hr class="border-t border-gray-600 mb-3">' : ''}
                    </div>
                `;

                uplinkContainer.insertAdjacentHTML('beforeend', html);
            });
        }
    },

    updateCellularIdentity(data) {
        this.setTextContent('radio-access-title', data?.FunctionResult?.Name ?? 'Radio Access');
    },

    renderDailyUsageChart(data) {
        const container = document.querySelector('#dailyUsageChart');
        if (!container) return;

        // Clear previous chart
        container.innerHTML = '';

        // Create SVG element
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("class", "w-full h-auto max-w-[200px] mx-auto");

        // Special case: Single data point
        if (data.last_7_days.length === 1) {
            const dayData = data.last_7_days[0];
            const color = '#3B82F6'; // Default blue color

            // Create full circle
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", "50");
            circle.setAttribute("cy", "50");
            circle.setAttribute("r", "45");
            circle.setAttribute("fill", color);
            circle.setAttribute("stroke", "#444");
            circle.setAttribute("stroke-width", "0.5");
            circle.setAttribute("class", "transition-all duration-300 hover:opacity-80");
            circle.setAttribute("data-date", dayData.date);
            circle.setAttribute("data-usage", dayData.combined.formatted);

            // Add tooltip
            circle.addEventListener('mouseenter', (e) => {
                const tooltip = document.createElement('div');
                tooltip.className = 'absolute bg-[#333] p-2 rounded shadow-lg text-xs z-10 border border-gray-600';
                tooltip.innerHTML = `
                    <strong class="text-white">${dayData.date}</strong><br>
                    <span class="text-blue-400">↑ ${dayData.upload.formatted}</span><br>
                    <span class="text-green-400">↓ ${dayData.download.formatted}</span><br>
                    <strong class="text-white">Total: ${dayData.combined.formatted}</strong><br>
                    100%
                `;
                tooltip.style.top = `${e.clientY - 60}px`;
                tooltip.style.left = `${e.clientX}px`;
                tooltip.id = 'chart-tooltip';
                document.body.appendChild(tooltip);
            });

            circle.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('chart-tooltip');
                if (tooltip) tooltip.remove();
            });

            svg.appendChild(circle);

            // Add center text
            const centerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            centerText.setAttribute("x", "50");
            centerText.setAttribute("y", "50");
            centerText.setAttribute("text-anchor", "middle");
            centerText.setAttribute("dominant-baseline", "middle");
            centerText.setAttribute("class", "text-sm font-bold fill-gray-300");
            svg.appendChild(centerText);

            // Create legend
            const legend = document.createElement('div');
            legend.className = 'flex flex-wrap justify-center gap-2 mt-4';

            const legendItem = document.createElement('div');
            legendItem.className = 'flex items-center text-xs';

            const colorBox = document.createElement('div');
            colorBox.className = 'w-3 h-3 rounded-full mr-1';
            colorBox.style.backgroundColor = color;

            const dateText = document.createElement('span');
            dateText.className = 'text-gray-300';
            dateText.textContent = new Date(dayData.date).toLocaleDateString('id-ID', {
                month: 'short',
                day: 'numeric'
            });

            legendItem.appendChild(colorBox);
            legendItem.appendChild(dateText);
            legend.appendChild(legendItem);

            container.appendChild(svg);
            container.appendChild(legend);
            return;
        }

        // Original multi-segment chart code for multiple data points
        // Calculate total combined usage (upload + download)
        const totalUsage = data.last_7_days.reduce((sum, day) =>
            sum + day.combined.raw_bytes, 0);

        // Create donut chart
        let cumulativePercent = 0;
        const colors = [
            '#A29BFE', '#FF8C94', '#FFB266', '#2EE59D',
            '#4FC3F7', '#FF6F61', '#FFD54F'
        ];

        // Calculate raw percentages first
        const rawPercentages = data.last_7_days.map(day =>
            (day.combined.raw_bytes / totalUsage) * 100 || 0);

        // Find minimum percentage and calculate adjustment
        const minPercentage = 1; // Minimum visible percentage (1%)
        const needsAdjustment = rawPercentages.some(p => p < minPercentage && p > 0);

        // Adjust percentages if needed
        const percentages = needsAdjustment
            ? rawPercentages.map(p => Math.max(p, minPercentage))
            : rawPercentages;

        // Normalize to ensure total is 100%
        const totalAdjusted = percentages.reduce((sum, p) => sum + p, 0);
        const normalizedPercentages = percentages.map(p => (p / totalAdjusted) * 100);

        data.last_7_days.forEach((day, index) => {
            const percent = normalizedPercentages[index];
            const originalPercent = rawPercentages[index];
            const segment = document.createElementNS("http://www.w3.org/2000/svg", "path");

            // Calculate segment path - ensure minimum arc length
            const effectivePercent = Math.max(percent, 0.1); // Ensure at least 0.1% for visibility

            const startX = 50 + 45 * Math.cos(2 * Math.PI * cumulativePercent / 100);
            const startY = 50 + 45 * Math.sin(2 * Math.PI * cumulativePercent / 100);
            cumulativePercent += effectivePercent;
            const endX = 50 + 45 * Math.cos(2 * Math.PI * cumulativePercent / 100);
            const endY = 50 + 45 * Math.sin(2 * Math.PI * cumulativePercent / 100);

            // Large arc flag if percent > 50%
            const largeArcFlag = effectivePercent > 50 ? 1 : 0;

            // Create path data with minimum segment size
            const pathData = [
                `M 50 50`,
                `L ${startX} ${startY}`,
                `A 45 45 0 ${largeArcFlag} 1 ${endX} ${endY}`,
                `Z`
            ].join(' ');

            segment.setAttribute("d", pathData);
            segment.setAttribute("fill", colors[index % colors.length]);
            segment.setAttribute("stroke", "#444");
            segment.setAttribute("stroke-width", "0.5");
            segment.setAttribute("class", "transition-all duration-300 hover:opacity-80");
            segment.setAttribute("data-date", day.date);
            segment.setAttribute("data-usage", day.combined.formatted);

            // Add tooltip functionality - show original percentage
            segment.addEventListener('mouseenter', (e) => {
                const tooltip = document.createElement('div');
                tooltip.className = 'absolute bg-[#333] p-2 rounded shadow-lg text-xs z-10 border border-gray-600';
                tooltip.innerHTML = `
                    <strong class="text-white">${day.date}</strong><br>
                    <span class="text-blue-400">↑ ${day.upload.formatted}</span><br>
                    <span class="text-green-400">↓ ${day.download.formatted}</span><br>
                    <strong class="text-white">Total: ${day.combined.formatted}</strong><br>
                    ${originalPercent.toFixed(1)}%${needsAdjustment ? '*' : ''}
                `;
                tooltip.style.top = `${e.clientY - 60}px`;
                tooltip.style.left = `${e.clientX}px`;
                tooltip.id = 'chart-tooltip';
                document.body.appendChild(tooltip);
            });

            segment.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('chart-tooltip');
                if (tooltip) tooltip.remove();
            });

            svg.appendChild(segment);
        });

        // Add center text with note if adjusted
        const centerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        centerText.setAttribute("x", "50");
        centerText.setAttribute("y", "50");
        centerText.setAttribute("text-anchor", "middle");
        centerText.setAttribute("dominant-baseline", "middle");
        centerText.setAttribute("class", "text-sm font-bold fill-gray-300");
        svg.appendChild(centerText);

        // Add to container
        container.appendChild(svg);

        // Create legend
        const legend = document.createElement('div');
        legend.className = 'flex flex-wrap justify-center gap-2 mt-4';

        data.last_7_days.forEach((day, index) => {
            const legendItem = document.createElement('div');
            legendItem.className = 'flex items-center text-xs';

            const colorBox = document.createElement('div');
            colorBox.className = 'w-3 h-3 rounded-full mr-1';
            colorBox.style.backgroundColor = colors[index % colors.length];

            const dateText = document.createElement('span');
            dateText.className = 'text-gray-300';
            dateText.textContent = new Date(day.date).toLocaleDateString('id-ID', {
                month: 'short',
                day: 'numeric'
            });
            dateText.textContent += ` (${day.combined.formatted})`;

            legendItem.appendChild(colorBox);
            legendItem.appendChild(dateText);
            legend.appendChild(legendItem);
        });

        // Add adjustment note if needed
        if (needsAdjustment) {
            const note = document.createElement('div');
            note.className = 'text-xs text-gray-400 mt-2 text-center';
            note.textContent = '* Small values are exaggerated for visibility';
            container.appendChild(note);
        }

        container.appendChild(legend);
    },

    updateSms(data) {
        if (!data?.FunctionResult?.SMSList) return;

        const smsList = data.FunctionResult.SMSList;
        const unreadCount = smsList.filter(sms => sms.SMSUnread).length;

        // Update badge
        const smsBadge = document.getElementById('smsBadge');
        if (unreadCount > 0) {
            smsBadge.textContent = unreadCount;
            smsBadge.classList.remove('hidden');
        } else {
            smsBadge.classList.add('hidden');
        }

        const previous = this.smsData || [];
        const previousIds = new Set(previous.map((sms) => sms.SMSID));
        const newMessages = smsList.filter((sms) => !previousIds.has(sms.SMSID));

        // Store SMS data for dialog
        this.smsData = smsList;

        if (newMessages.length > 0) {
            const formatMessagePreview = (sms) => {
                const sender = sms.SMSSender || 'Unknown';
                const body = (sms.SMSContent || '').trim();
                let preview = body;
                if (preview.length > 80) {
                    preview = `${preview.slice(0, 77)}…`;
                }
                return preview ? `${sender}: ${preview}` : `From ${sender}`;
            };

            const message = newMessages.length === 1
                ? formatMessagePreview(newMessages[0])
                : `${newMessages.length} new messages`;

            App.showNotification({
                title: 'New SMS received',
                message,
                tone: 'info'
            });
        }

        const smsDialog = document.getElementById('smsDialog');
        if (smsDialog?.classList.contains('active')) {
            renderSmsDialog();
        }
    },
};

function setButtonLoadingState(button, loading, { loadingText = 'Processing…', spinnerColor = 'text-white' } = {}) {
    if (!button) return;

    if (loading) {
        if (!button.dataset.defaultContent) {
            button.dataset.defaultContent = button.innerHTML;
        }
        const safeText = DOM.escapeHtml(loadingText);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.innerHTML = `
            <span class="inline-flex items-center gap-2">
                <svg class="h-4 w-4 animate-spin ${spinnerColor}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>${safeText}</span>
            </span>
        `;
    } else {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (button.dataset.defaultContent) {
            button.innerHTML = button.dataset.defaultContent;
        }
    }
}

// Main Application
const App = {
    latestPreloginStatus: null,
    pollIntervalMs: 1000,
    async init() {
        this.initConfigDialog();
        this.initNotifications();
        this.initConnectedDevicesModal();
        this.initWanIpDialog();

        let configSnapshot = null;

        try {
            try {
                configSnapshot = await API.getConfig();
            } catch (configError) {
                console.warn("Failed to load configuration snapshot:", configError);
            }

            if (configSnapshot) {
                this.applyPollingIntervalFromConfig(configSnapshot, { restart: false });
            } else {
                this.setPollIntervalControlFromMs(this.pollIntervalMs);
            }

            // Initial data load
            await this.loadData();

            // Load daily usage data
            await this.loadDailyUsage();

            // Only fetch once
            const wlan2 = await API.getWlan24gStatus();
            const wlan5 = await API.getWlan5gStatus();

            // Combine both networks into one object
            const combinedWlan = {
                wlan_config_glb: wlan2?.wlan_config_glb,
                wlan_config_glb11ac: wlan5?.wlan_config_glb11ac
            };

            DOM.updateWlanStatus(combinedWlan);

            // Initialize expiration manager after other elements are loaded
            ExpirationManager.init();
        } catch (error) {
            console.error("Initialization error:", error);
            // Consider adding user-facing error notification here
        }

        // Set up polling regardless of initial load outcome
        this.startPolling(this.pollIntervalMs);
    },

    async loadData() {
        const status = await API.getPreloginStatus();
        this.latestPreloginStatus = status;
        const statusWeb = await API.getStatusWeb();
        const service = await API.getServiceData();
        const device = await API.getDeviceStatus();
        const sms = await API.getSmsList();
        DOM.updateSignalStats(status);
        DOM.updateNetworkInfo(status);
        DOM.updateConnectedStatus(status);
        DOM.updateLanStatus(status);
        DOM.updateStatusWeb(statusWeb);
        DOM.updateServiceInfo(service);
        DOM.updateDeviceStatus(device);
        DOM.updateSms(sms);

        if (this.wanIpDialog?.classList.contains('active')) {
            await this.renderWanIpDialog(true);
        }
    },

    async loadDailyUsage() {
        const cellIdentity = await API.getCellularIdentity();
        const dailyUsage = await API.getFormattedDailyUsage();
        this.dailyUsageData = dailyUsage;
        DOM.updateCellularIdentity(cellIdentity);
        DOM.renderDailyUsageChart(dailyUsage);
        document.getElementById('cellTotalDl').textContent = dailyUsage?.last_7_days?.[0]?.download?.formatted || '0 B';
        document.getElementById('cellTotalUl').textContent = dailyUsage?.last_7_days?.[0]?.upload?.formatted || '0 B';
        document.getElementById('totalUsage').textContent = dailyUsage?.total_usage?.combined || '0 B';
    },

    initConfigDialog() {
        this.configDialog = document.getElementById('configDialog');
        if (!this.configDialog) return;

        this.configForm = document.getElementById('configForm');
        this.configSaveBtn = document.getElementById('configSaveBtn');
        this.configCancelBtn = document.getElementById('configCancelBtn');
        this.configInputs = {
            routerHost: document.getElementById('configRouterHost'),
            routerUser: document.getElementById('configRouterUser'),
            routerPassword: document.getElementById('configRouterPassword'),
            listenHost: document.getElementById('configListenHost'),
            listenPort: document.getElementById('configListenPort'),
            pollInterval: document.getElementById('configPollInterval'),
            pollIntervalLabel: document.getElementById('configPollIntervalValue')
        };

        const openBtn = document.getElementById('configIcon');
        const closeBtn = document.getElementById('configCloseDialog');

        openBtn?.addEventListener('click', () => this.openConfigDialog());
        closeBtn?.addEventListener('click', () => this.closeConfigDialog());
        this.configCancelBtn?.addEventListener('click', () => this.closeConfigDialog());
        this.configForm?.addEventListener('submit', (event) => this.submitConfigForm(event));

        this.configInputs.pollInterval?.addEventListener('input', (event) => {
            const value = Number(event.target.value) || 1;
            this.updatePollIntervalPreview(value);
        });
    },

    initNotifications() {
        this.notificationRoot = document.getElementById('notificationRoot');
        if (this.notificationRoot && !this.notificationRoot.querySelector('.toast-container')) {
            const container = document.createElement('div');
            container.className = 'toast-container pointer-events-auto';
            this.notificationRoot.appendChild(container);
        }
    },

    initConnectedDevicesModal() {
        this.connectedDevices = {
            modal: document.getElementById('connectedDevicesModal'),
            trigger: document.getElementById('connectedDevicesViewAll'),
            closeBtn: document.getElementById('connectedDevicesClose'),
            loading: document.getElementById('connectedDevicesLoading'),
            error: document.getElementById('connectedDevicesError'),
            content: document.getElementById('connectedDevicesContent'),
            summary: document.getElementById('connectedDevicesSummary'),
            ethernetList: document.getElementById('connectedEthernetList'),
            ethernetEmpty: document.getElementById('connectedEthernetEmpty'),
            ethernetCount: document.getElementById('connectedEthernetCount'),
            wifiList: document.getElementById('connectedWifiList'),
            wifiEmpty: document.getElementById('connectedWifiEmpty'),
            wifiCount: document.getElementById('connectedWifiCount')
        };

        const { trigger, closeBtn, modal } = this.connectedDevices ?? {};
        if (!modal || !trigger) {
            return;
        }

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            this.openConnectedDevicesModal();
        });
        trigger.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.openConnectedDevicesModal();
            }
        });
        closeBtn?.addEventListener('click', () => this.closeConnectedDevicesModal());
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeConnectedDevicesModal();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('active')) {
                this.closeConnectedDevicesModal();
            }
        });
    },

    initWanIpDialog() {
        this.wanIpDialog = document.getElementById('wanIpDialog');
        if (!this.wanIpDialog) return;

        this.wanIpTrigger = document.getElementById('wanIpTrigger');
        this.wanIpDialogClose = document.getElementById('wanIpDialogClose');
        this.wanIpDialogLoading = document.getElementById('wanIpDialogLoading');
        this.wanIpDialogError = document.getElementById('wanIpDialogError');
        this.wanIpDialogContent = document.getElementById('wanIpDialogContent');

        this.wanIpTrigger?.addEventListener('click', (event) => {
            event.preventDefault();
            this.openWanIpDialog();
        });
        this.wanIpTrigger?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.openWanIpDialog();
            }
        });

        this.wanIpDialogClose?.addEventListener('click', () => this.closeWanIpDialog());
        this.wanIpDialog.addEventListener('click', (event) => {
            if (event.target === this.wanIpDialog) {
                this.closeWanIpDialog();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.wanIpDialog.classList.contains('active')) {
                this.closeWanIpDialog();
            }
        });
    },

    async openWanIpDialog() {
        if (!this.wanIpDialog) return;
        this.wanIpDialog.classList.add('active');
        await this.renderWanIpDialog();
    },

    closeWanIpDialog() {
        this.wanIpDialog?.classList.remove('active');
    },

    async renderWanIpDialog(suppressLoading = false) {
        if (!this.wanIpDialog) return;

        const showLoading = (visible) => {
            if (this.wanIpDialogLoading) {
                this.wanIpDialogLoading.classList.toggle('hidden', !visible);
            }
        };
        const showError = (message) => {
            if (!this.wanIpDialogError) return;
            if (message) {
                this.wanIpDialogError.textContent = message;
                this.wanIpDialogError.classList.remove('hidden');
            } else {
                this.wanIpDialogError.textContent = '';
                this.wanIpDialogError.classList.add('hidden');
            }
        };
        const showContent = (visible) => {
            if (this.wanIpDialogContent) {
                this.wanIpDialogContent.classList.toggle('hidden', !visible);
            }
        };

        if (suppressLoading) {
            showLoading(false);
            showError('');
        } else {
            showLoading(true);
            showError('');
            showContent(false);
        }

        let status = this.latestPreloginStatus;
        if (!status) {
            try {
                status = await API.getPreloginStatus();
                this.latestPreloginStatus = status;
                DOM.updateNetworkInfo(status);
            } catch (error) {
                showLoading(false);
                showError(error.message || 'Unable to fetch WAN information.');
                showContent(false);
                return;
            }
        }

        const details = this.extractWanDetails(status);
        if (!details) {
            showLoading(false);
            showError('WAN connection details are unavailable.');
            showContent(false);
            return;
        }

        const renderList = (id, values, label = '') => {
            const el = document.getElementById(id);
            if (!el) return;
            if (!values || values.length === 0) {
                el.innerHTML = '<li class="text-xs text-[#6f768f]">Not provided</li>';
                return;
            }
            el.innerHTML = values
                .map((value) => {
                    const safeValue = DOM.escapeHtml(value);
                    const safeLabel = DOM.escapeHtml(label || 'Value');
                    return `
                        <li>
                            <button
                                type="button"
                                class="wan-copy-button group flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left transition focus:outline-none"
                                data-copy-value="${safeValue}"
                                data-copy-label="${safeLabel}"
                            >
                                <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400"></span>
                                <span class="flex-1 break-all text-sm text-[#d6d9e1]">${safeValue}</span>
                            </button>
                        </li>`;
                })
                .join('');
        };

        renderList('wanIpIpv4', details.ipv4 ? [details.ipv4] : [], 'IPv4 Address');
        renderList('wanIpIpv6', details.ipv6 ? [details.ipv6] : [], 'IPv6 Address');
        renderList('wanIpDnsV4', details.dnsV4, 'IPv4 DNS');
        renderList('wanIpDnsV6', details.dnsV6, 'IPv6 DNS');

        this.bindWanCopyHandlers();

        showLoading(false);
        showError('');
        showContent(true);
    },

    extractWanDetails(status) {
        const connection = status?.wan_conns?.[0]?.ipConns?.[0];
        if (!connection) {
            return null;
        }

        const parseList = (value) => {
            if (typeof value !== 'string') {
                return [];
            }
            return value
                .split(/[\s,]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        };

        return {
            ipv4: connection.ExternalIPAddress || 'Unavailable',
            ipv6: connection.X_CT_COM_IPv6IPAddress || 'Unavailable',
            dnsV4: parseList(connection.DNSServers),
            dnsV6: parseList(connection.X_CT_COM_IPv6DNSServers),
        };
    },

    bindWanCopyHandlers() {
        if (!this.wanIpDialog) return;
        const buttons = this.wanIpDialog.querySelectorAll('.wan-copy-button');
        buttons.forEach((button) => {
            button.onclick = async (event) => {
                event.preventDefault();
                const value = button.dataset.copyValue;
                if (!value) return;
                const label = button.dataset.copyLabel || 'Value';

                let copied = false;
                if (navigator.clipboard?.writeText) {
                    try {
                        await navigator.clipboard.writeText(value);
                        copied = true;
                    } catch (_) {
                        copied = false;
                    }
                }
                if (!copied) {
                    const textarea = document.createElement('textarea');
                    textarea.value = value;
                    textarea.setAttribute('readonly', '');
                    textarea.style.position = 'absolute';
                    textarea.style.left = '-9999px';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        copied = true;
                    } catch (_) {
                        copied = false;
                    } finally {
                        document.body.removeChild(textarea);
                    }
                }

                if (copied) {
                    App.showNotification({
                        title: 'Copied to clipboard',
                        message: `${label}: ${value}`,
                        tone: 'success'
                    });
                } else {
                    App.showNotification({
                        title: 'Copy failed',
                        message: 'Unable to copy value. Please copy manually.',
                        tone: 'error'
                    });
                }
            };
        });
    },

    async openConnectedDevicesModal() {
        const modal = this.connectedDevices?.modal;
        if (!modal) return;
        modal.classList.add('active');
        await this.refreshConnectedDevicesModal();
    },

    closeConnectedDevicesModal() {
        const modal = this.connectedDevices?.modal;
        if (!modal) return;
        modal.classList.remove('active');
    },

    toggleConnectedDevicesLoading(show) {
        const loading = this.connectedDevices?.loading;
        if (!loading) return;
        loading.classList.toggle('hidden', !show);
    },

    toggleConnectedDevicesContent(show) {
        const content = this.connectedDevices?.content;
        if (!content) return;
        content.classList.toggle('hidden', !show);
    },

    showConnectedDevicesError(message) {
        const errorEl = this.connectedDevices?.error;
        if (!errorEl) return;
        if (message) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
    },

    async refreshConnectedDevicesModal() {
        if (!this.connectedDevices?.modal) return;
        this.toggleConnectedDevicesLoading(true);
        this.toggleConnectedDevicesContent(false);
        this.showConnectedDevicesError('');

        try {
            const data = await API.getNetworkClients();
            this.connectedDevicesData = data;
            const parsed = this.parseNetworkClients(data);
            this.renderConnectedDevices(parsed);
            this.toggleConnectedDevicesContent(true);
        } catch (error) {
            console.error('Failed to load network clients:', error);
            this.showConnectedDevicesError(error.message || 'Failed to load connected devices.');
        } finally {
            this.toggleConnectedDevicesLoading(false);
        }
    },

    parseNetworkClients(data) {
        const result = {
            ethernet: [],
            wifi: [],
            aps: [],
            radios: [],
            capabilities: this.extractCapabilities(data?.network?.clients?.capabilities),
            raw: data
        };

        const aps = Array.isArray(data?.aps) ? data.aps : [];
        aps.forEach((apEntry) => {
            const ap = this.unwrapSingleEntry(apEntry);
            if (!ap) return;

            const macAddress = this.normalizeMacAddress(ap['mac-address']);
            const apKey = macAddress || (ap['router-id-str'] || String(ap['router-id'] || ''));

            const apMeta = {
                key: apKey,
                routerId: ap['router-id-str'] || ap['router-id'] || '',
                hostname: ap.hostname || 'Access point',
                ip: ap['ip-address'] || '',
                mac: macAddress,
                software: ap['software-version'] || '',
                uptime: typeof ap['uptime-sec'] === 'number' ? ap['uptime-sec'] : this.coerceNumber(ap['uptime-sec'])
            };
            result.aps.push(apMeta);

            const ethernetClients = Array.isArray(ap['ethernet-clients']) ? ap['ethernet-clients'] : [];
            ethernetClients.forEach((clientEntry) => {
                const client = this.unwrapSingleEntry(clientEntry);
                if (!client) return;

                const mac = this.normalizeMacAddress(client['mac-address'] || Object.keys(clientEntry || {})[0]);
                if (!mac) return;

                const phyRate = this.coerceNumber(client['phy-rate']);
                const port = this.coerceNumber(client['port-number']);

                result.ethernet.push({
                    type: 'Ethernet',
                    mac,
                    name: client['host-name'] || client['hostname'] || '',
                    ip: client['ip-address'] || client['ipv4-address'] || '',
                    port: Number.isFinite(port) ? port : null,
                    phyRate: Number.isFinite(phyRate) ? phyRate : null,
                    vendor: client['vendor'],
                    ap: apMeta,
                    apKey,
                    raw: client
                });
            });

            const radios = Array.isArray(ap.radios) ? ap.radios : [];
            radios.forEach((radioEntry) => {
                const radio = this.unwrapSingleEntry(radioEntry);
                if (!radio) return;

                const radioMeta = {
                    id: this.normalizeMacAddress(radio['radio-id'] || radio['mac-address']) || '',
                    medium: radio.medium || '',
                    band: radio.band || radio['band-type'] || radio['frequency-band'] || this.mediumToBand(radio.medium),
                    standard: radio['wifi-standard'] || '',
                    channel: this.coerceNumber(radio['channel'] ?? radio['channel-number']),
                    metrics: radio.metrics || {},
                    ap: apMeta,
                    apKey
                };
                result.radios.push(radioMeta);

                const ssids = Array.isArray(radio.ssids) ? radio.ssids : [];
                ssids.forEach((ssidEntry) => {
                    const ssid = this.unwrapSingleEntry(ssidEntry);
                    if (!ssid) return;

                    const ssidName = ssid.ssid || '';
                    const bssid = this.normalizeMacAddress(ssid.bssid || radioMeta.id);
                    const clients = Array.isArray(ssid.clients) ? ssid.clients : [];

                    clients.forEach((clientEntry) => {
                        const clientPayload = this.unwrapSingleEntry(clientEntry);
                        if (!clientPayload) return;

                        const macValue = clientPayload['mac-address'] || Object.keys(clientEntry || {})[0];
                        const mac = this.normalizeMacAddress(macValue);
                        if (!mac) return;

                        const metrics = clientPayload.metrics || {};
                        const ewma = clientPayload['ewma-metrics'] || {};
                        const sensing = clientPayload['sensing-data'] || {};
                        const stats = clientPayload.stats || {};
                        const capabilities = clientPayload.capabilities || {};

                        result.wifi.push({
                            type: 'WiFi',
                            mac,
                            name: clientPayload['host-name'] || clientPayload['hostname'] || clientPayload['device-name'] || '',
                            ip: clientPayload['ip-address'] || clientPayload['ipv4-address'] || '',
                            rssiDbm: this.coerceNumber(sensing['rssi-dbm']),
                            signalStrength: this.coerceNumber(metrics['signal-strength'] ?? ewma['signal-strength'] ?? sensing.metric),
                            downRateKbps: this.coerceNumber(metrics['last-data-dl-rate'] ?? ewma['last-data-dl-rate'] ?? sensing['data-rate-rx-kbps']),
                            upRateKbps: this.coerceNumber(metrics['last-data-ul-rate'] ?? ewma['last-data-ul-rate'] ?? sensing['data-rate-tx-kbps']),
                            phyRate: this.coerceNumber(clientPayload['phy-rate'] ?? clientPayload['link-rate']),
                            band: radioMeta.band,
                            medium: radioMeta.medium,
                            standard: radioMeta.standard,
                            channel: radioMeta.channel,
                            ssid: ssidName,
                            bssid,
                            vendor: clientPayload['vendor'],
                            state: clientPayload['state'],
                            txBytes: this.coerceNumber(stats['total-tx-bytes']),
                            rxBytes: this.coerceNumber(stats['total-rx-bytes']),
                            secondsSinceSeen: this.coerceNumber(sensing['seconds-since-seen']),
                            connectedSeconds: this.coerceNumber(clientPayload['connected-time'] ?? clientPayload['connection-time']),
                            capabilities,
                            ap: apMeta,
                            apMac: apMeta.mac,
                            apKey,
                            raw: clientPayload
                        });
                    });
                });
            });
        });

        return result;
    },

    unwrapSingleEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
        }
        const keys = Object.keys(entry);
        if (keys.length === 1) {
            const candidate = entry[keys[0]];
            if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                return candidate;
            }
        }
        return entry;
    },

    normalizeMacAddress(mac) {
        if (!mac) return '';
        const raw = String(mac).trim();
        if (!raw) return '';
        const hex = raw.replace(/[^0-9a-fA-F]/g, '');
        if (hex.length === 12) {
            return hex.match(/.{1,2}/g).join(':').toUpperCase();
        }
        return raw.toUpperCase();
    },

    extractCapabilities(capabilities) {
        if (!capabilities || typeof capabilities !== 'object') {
            return [];
        }
        return Object.entries(capabilities)
            .filter(([, value]) => value === true || value === 'true' || value === 1 || value === '1')
            .map(([key]) => this.formatCapabilityLabel(key));
    },

    formatCapabilityLabel(key) {
        if (!key) return '';
        const labelMap = {
            'capable-24ghz-csa': '2.4 GHz CSA',
            'capable-24ghz-ecsa': '2.4 GHz eCSA',
            'capable-24ghz-mimo': '2.4 GHz MIMO',
            'capable-24ghz-n': '2.4 GHz 802.11n',
            'capable-24ghz-rx-streams': '2.4 GHz RX Streams',
            'capable-24ghz-tx-streams': '2.4 GHz TX Streams',
            'capable-5ghz-csa': '5 GHz CSA',
            'capable-5ghz-ecsa': '5 GHz eCSA',
            'capable-5ghz-mimo': '5 GHz MIMO',
            'capable-5ghz-ac': '5 GHz 802.11ac',
            'capable-5ghz-n': '5 GHz 802.11n',
            'capable-5ghz-rx-streams': '5 GHz RX Streams',
            'capable-5ghz-tx-streams': '5 GHz TX Streams',
            'capable-6ghz': '6 GHz capable',
            'capable-6ghz-csa': '6 GHz CSA',
            'capable-6ghz-ecsa': '6 GHz eCSA',
            'capable-6ghz-mimo': '6 GHz MIMO',
            'capable-6ghz-rx-streams': '6 GHz RX Streams',
            'capable-6ghz-tx-streams': '6 GHz TX Streams',
            'capable-dfs': 'DFS aware',
            'capable-fast-bss-transition': 'Fast BSS transition',
            'capable-bss-transition': 'BSS transition',
            'capable-radio-measurement': 'Radio measurement'
        };
        if (labelMap[key]) {
            return labelMap[key];
        }
        return key
            .replace(/[-_]/g, ' ')
            .replace(/\b([a-z])/g, (match) => match.toUpperCase());
    },

    mediumToBand(medium) {
        const label = this.formatMediumLabel(medium);
        return label || medium || '';
    },

    formatMediumLabel(medium) {
        switch (medium) {
        case 'wifi-24':
            return '2.4 GHz';
        case 'wifi-5':
            return '5 GHz';
        case 'wifi-6':
            return '6 GHz';
        case 'ethernet':
            return 'Ethernet';
        default:
            if (!medium) return '';
            return medium.replace(/[-_]/g, ' ').replace(/\b([a-z])/g, (match) => match.toUpperCase());
        }
    },

    coerceNumber(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : null;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? parsed : null;
        }
        if (typeof value === 'object' && value instanceof Number) {
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        }
        return null;
    },

    formatRateKbps(value) {
        const num = this.coerceNumber(value);
        if (num === null) return '';
        if (Math.abs(num) >= 1000) {
            const mbps = num / 1000;
            const precision = mbps >= 100 ? 0 : mbps >= 10 ? 1 : 2;
            return `${mbps.toFixed(precision)} Mbps`;
        }
        return `${num} Kbps`;
    },

    formatBytes(value) {
        const num = this.coerceNumber(value);
        if (num === null) return '';
        if (num === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        let unitIndex = 0;
        let size = num;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        const precision = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
        return `${size.toFixed(precision)} ${units[unitIndex]}`;
    },

    formatDurationSeconds(value) {
        const num = this.coerceNumber(value);
        if (num === null) return '';
        if (num <= 0) return 'just now';
        const seconds = Math.floor(num);
        const periods = [
            { label: 'd', seconds: 86400 },
            { label: 'h', seconds: 3600 },
            { label: 'm', seconds: 60 },
            { label: 's', seconds: 1 }
        ];
        const parts = [];
        let remaining = seconds;
        for (const period of periods) {
            if (remaining >= period.seconds) {
                const valuePart = Math.floor(remaining / period.seconds);
                parts.push(`${valuePart}${period.label}`);
                remaining %= period.seconds;
            }
            if (parts.length === 2) {
                break;
            }
        }
        return parts.join(' ');
    },

    formatSignal(rssiDbm, signalStrength) {
        const rssi = this.coerceNumber(rssiDbm);
        if (rssi !== null) {
            return `${rssi} dBm`;
        }
        const signal = this.coerceNumber(signalStrength);
        if (signal !== null) {
            return `${signal}`;
        }
        if (rssiDbm !== undefined && rssiDbm !== null && rssiDbm !== '') {
            return String(rssiDbm);
        }
        if (signalStrength !== undefined && signalStrength !== null && signalStrength !== '') {
            return String(signalStrength);
        }
        return '';
    },

    formatClientCapabilities(capabilities) {
        if (!capabilities || typeof capabilities !== 'object') {
            return '';
        }
        const enabled = Object.entries(capabilities)
            .filter(([, value]) => value === true || value === 'true' || value === 1 || value === '1')
            .map(([key]) => this.formatCapabilityLabel(key));
        return enabled.join(', ');
    },

    renderConnectedDevices(parsed) {
        const refs = this.connectedDevices;
        if (!refs) return;

        if (refs.summary) {
            if (!parsed.aps.length) {
                refs.summary.innerHTML = '<p class="col-span-full text-xs text-gray-500">No access points reported.</p>';
            } else {
                const summaryHtml = parsed.aps.map((ap) => {
                    const wifiCount = parsed.wifi.filter((client) => client.apKey === ap.key).length;
                    const ethernetCount = parsed.ethernet.filter((client) => client.apKey === ap.key).length;
                    const radios = parsed.radios.filter((radio) => radio.apKey === ap.key);

                    const hostname = DOM.escapeHtml(ap.hostname || ap.routerId || 'Access point');
                    const ip = ap.ip ? DOM.escapeHtml(ap.ip) : '';
                    const mac = ap.mac ? DOM.escapeHtml(ap.mac) : '';
                    const software = ap.software ? DOM.escapeHtml(ap.software) : '';
                    const uptime = typeof ap.uptime === 'number' ? DOM.escapeHtml(DOM.formatUptime(ap.uptime)) : '';

                    const countsLine = `<div class="text-xs text-gray-400">Devices: WiFi ${wifiCount} · Ethernet ${ethernetCount}</div>`;
                    const radioBadges = radios.map((radio) => {
                        const mediumLabel = this.formatMediumLabel(radio.medium) || radio.band || radio.standard;
                        const channelLabel = Number.isFinite(radio.channel) ? `Ch ${radio.channel}` : '';
                        const parts = [mediumLabel, channelLabel].filter(Boolean).join(' · ');
                        if (!parts) return '';
                        return `<span class="inline-flex items-center gap-1 text-[11px] font-medium bg-[#2d2d2d] text-gray-200 px-2 py-1 rounded-full border border-[#3e3e3e]">${DOM.escapeHtml(parts)}</span>`;
                    }).filter(Boolean).join('');
                    const radiosLine = radioBadges ? `<div class="flex flex-wrap gap-2 pt-2">${radioBadges}</div>` : '';

                    return `
                        <article class="rounded-lg border border-[#3a3a3a] bg-[#222222] p-4 space-y-1">
                            <div class="text-sm font-semibold text-[#f1f1f1]">${hostname}</div>
                            ${ip ? `<div class="text-xs text-gray-400">IP: ${ip}</div>` : ''}
                            ${mac ? `<div class="text-xs text-gray-400">MAC: ${mac}</div>` : ''}
                            ${software ? `<div class="text-xs text-gray-500">Firmware: ${software}</div>` : ''}
                            ${uptime ? `<div class="text-xs text-gray-500">Uptime: ${uptime}</div>` : ''}
                            ${countsLine}
                            ${radiosLine}
                        </article>
                    `;
                }).join('');
                const capabilitySection = parsed.capabilities.length
                    ? `
                        <article class="rounded-lg border border-[#3a3a3a] bg-[#1b1b1b] p-4">
                            <div class="text-xs font-semibold uppercase tracking-wide text-[#e5e5e5] mb-2">Network features</div>
                            <div class="flex flex-wrap gap-2">
                                ${parsed.capabilities.map((cap) =>
                                    `<span class="inline-flex items-center gap-1 text-[11px] font-medium bg-[#2d2d2d] text-gray-200 px-2 py-1 rounded-full border border-[#3e3e3e]">${DOM.escapeHtml(cap)}</span>`
                                ).join('')}
                            </div>
                        </article>
                    `
                    : '';
                refs.summary.innerHTML = summaryHtml + capabilitySection;
            }
        }

        if (refs.ethernetCount) {
            refs.ethernetCount.textContent = `${parsed.ethernet.length} device${parsed.ethernet.length === 1 ? '' : 's'}`;
        }
        if (refs.ethernetList) {
            if (!parsed.ethernet.length) {
                refs.ethernetList.innerHTML = '';
                refs.ethernetEmpty?.classList.remove('hidden');
            } else {
                refs.ethernetEmpty?.classList.add('hidden');
                refs.ethernetList.innerHTML = parsed.ethernet.map((client) => this.renderConnectedDeviceCard(client)).join('');
            }
        }

        if (refs.wifiCount) {
            refs.wifiCount.textContent = `${parsed.wifi.length} device${parsed.wifi.length === 1 ? '' : 's'}`;
        }
        if (refs.wifiList) {
            if (!parsed.wifi.length) {
                refs.wifiList.innerHTML = '';
                refs.wifiEmpty?.classList.remove('hidden');
            } else {
                refs.wifiEmpty?.classList.add('hidden');
                refs.wifiList.innerHTML = parsed.wifi.map((client) => this.renderConnectedDeviceCard(client)).join('');
            }
        }
    },

    renderConnectedDeviceCard(client) {
        const name = client.name ? DOM.escapeHtml(client.name) : '';
        const mac = client.mac ? DOM.escapeHtml(client.mac) : '';
        const ip = (client.ip && client.ip !== '0.0.0.0') ? DOM.escapeHtml(client.ip) : '';
        const type = DOM.escapeHtml(client.type || 'Device');

        const title = name || mac || 'Unknown device';
        const macLine = name ? mac : '';

        const apInfoParts = [];
        if (client.ap?.hostname) {
            apInfoParts.push(DOM.escapeHtml(client.ap.hostname));
        }
        if (client.ap?.ip) {
            apInfoParts.push(`IP ${DOM.escapeHtml(client.ap.ip)}`);
        }

        const topRightLines = [];
        if (apInfoParts.length) {
            topRightLines.push(`<div>${apInfoParts.join(' · ')}</div>`);
        }
        if (client.type === 'WiFi') {
            const radioParts = [
                this.formatMediumLabel(client.medium),
                client.standard,
                Number.isFinite(client.channel) ? `Ch ${client.channel}` : ''
            ].filter(Boolean).map((value) => DOM.escapeHtml(value));
            if (radioParts.length) {
                topRightLines.push(`<div>${radioParts.join(' · ')}</div>`);
            }
        }
        if (client.ap?.mac) {
            topRightLines.push(`<div>${DOM.escapeHtml(client.ap.mac)}</div>`);
        }

        let tags = [];
        if (client.type === 'WiFi') {
            tags = [
                this.createDeviceTag('SSID', client.ssid),
                this.createDeviceTag('BSSID', client.bssid),
                this.createDeviceTag('Band', client.band || this.formatMediumLabel(client.medium)),
                this.createDeviceTag('Channel', Number.isFinite(client.channel) ? `Ch ${client.channel}` : client.channel),
                this.createDeviceTag('Standard', client.standard),
                this.createDeviceTag('State', client.state),
                this.createDeviceTag('Signal', this.formatSignal(client.rssiDbm, client.signalStrength)),
                this.createDeviceTag('Downlink', this.formatRateKbps(client.downRateKbps)),
                this.createDeviceTag('Uplink', this.formatRateKbps(client.upRateKbps)),
                this.createDeviceTag('PHY', this.formatRate(client.phyRate)),
                this.createDeviceTag('RX', this.formatBytes(client.rxBytes)),
                this.createDeviceTag('TX', this.formatBytes(client.txBytes)),
                this.createDeviceTag('Vendor', client.vendor),
                this.createDeviceTag('Last seen', this.formatDurationSeconds(client.secondsSinceSeen)),
                this.createDeviceTag('Connected', this.formatDurationSeconds(client.connectedSeconds)),
                this.createDeviceTag('Capabilities', this.formatClientCapabilities(client.capabilities))
            ];
        } else {
            tags = [
                this.createDeviceTag('Port', client.port),
                this.createDeviceTag('PHY', this.formatRate(client.phyRate)),
                this.createDeviceTag('Vendor', client.vendor)
            ];
        }
        tags = tags.filter(Boolean);

        return `
            <article class="rounded-lg border border-[#3a3a3a] bg-[#222222] p-4 space-y-3">
                <div class="flex flex-wrap justify-between gap-3">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-wide text-gray-400">${type}</div>
                        <div class="text-sm font-semibold text-[#f1f1f1]">${title}</div>
                        ${macLine ? `<div class="text-xs text-gray-500">${macLine}</div>` : ''}
                        ${ip ? `<div class="text-xs text-gray-500">IP: ${ip}</div>` : ''}
                    </div>
                    <div class="text-right text-[11px] text-gray-500">
                        ${topRightLines.join('')}
                    </div>
                </div>
                ${tags.length ? `<div class="flex flex-wrap gap-2">${tags.join('')}</div>` : ''}
            </article>
        `;
    },

    createDeviceTag(label, value) {
        if (value === undefined || value === null || value === '') {
            return '';
        }
        const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
        if (text === undefined || text === null || text === '') {
            return '';
        }
        const formatted = String(text);
        if (!formatted.trim() && formatted !== '0') {
            return '';
        }
        return `<span class="inline-flex items-center gap-1 text-[11px] font-medium bg-[#2d2d2d] text-gray-200 px-2 py-1 rounded-full border border-[#3e3e3e]">${DOM.escapeHtml(label)}: ${DOM.escapeHtml(formatted)}</span>`;
    },

    formatRate(value) {
        const num = this.coerceNumber(value);
        if (num === null) return '';
        if (Math.abs(num) >= 1000) {
            const gbps = num / 1000;
            const precision = gbps >= 100 ? 0 : gbps >= 10 ? 1 : 2;
            return `${gbps.toFixed(precision)} Gbps`;
        }
        const precision = Math.abs(num) >= 10 ? 0 : 1;
        return `${num.toFixed(precision)} Mbps`;
    },

    showNotification({ title = 'Notification', message = '', tone = 'info', duration = 4000 } = {}) {
        if (!this.notificationRoot) return;

        const container = this.notificationRoot.querySelector('.toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast--${tone} pointer-events-auto`;

        const content = document.createElement('div');
        content.className = 'toast__content';

        const titleEl = document.createElement('div');
        titleEl.className = 'toast__title';
        titleEl.textContent = title;

        const messageEl = document.createElement('div');
        messageEl.className = 'toast__message';
        messageEl.textContent = message;

        content.appendChild(titleEl);
        if (message) {
            content.appendChild(messageEl);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast__close';
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => {
            this.dismissNotification(toast);
        });

        toast.appendChild(content);
        toast.appendChild(closeBtn);

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        let timeoutId;
        if (duration > 0) {
            timeoutId = setTimeout(() => this.dismissNotification(toast), duration);
        }

        const dismiss = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            this.dismissNotification(toast);
        };

        return { element: toast, dismiss };
    },

    dismissNotification(toast) {
        if (!toast) return;
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 250);
    },

    async openConfigDialog() {
        if (!this.configDialog) return;

        this.configForm?.reset();
        this.toggleConfigLoading(true, 'Loading...');

        this.configDialog.classList.add('active');

        try {
            const cfg = await API.getConfig();
            this.populateConfigForm(cfg);
        } catch (error) {
            console.error('Failed to load configuration:', error);
            this.showNotification({
                title: 'Failed to load configuration',
                message: error.message || 'Please try again shortly.',
                tone: 'error'
            });
        } finally {
            this.toggleConfigLoading(false);
        }
    },

    closeConfigDialog() {
        if (!this.configDialog) return;
        this.configDialog.classList.remove('active');
        this.toggleConfigLoading(false);
    },

    async submitConfigForm(event) {
        event.preventDefault();
        if (!this.configForm) return;

        const pollSeconds = Math.max(1, Math.round(Number(this.configInputs.pollInterval?.value || '1')));
        const pollIntervalMs = Math.max(500, pollSeconds * 1000);

        const payload = {
            router_host: this.configInputs.routerHost?.value?.trim() || '',
            router_user: this.configInputs.routerUser?.value?.trim() || '',
            router_password: this.configInputs.routerPassword?.value || '',
            listen_host: this.configInputs.listenHost?.value?.trim() || '',
            listen_port: this.configInputs.listenPort?.value?.trim() || '',
            poll_interval_ms: pollIntervalMs
        };

        this.toggleConfigLoading(true);
        const targetHost = payload.listen_host;
        const targetPort = payload.listen_port;

        try {
            await API.checkListener(targetHost, targetPort);
        } catch (error) {
            console.error('Listener availability check failed:', error);
            this.showNotification({
                title: 'Listener Unavailable',
                message: error.message,
                tone: 'error'
            });
            this.toggleConfigLoading(false);
            return;
        }

        try {
            const response = await API.updateConfig(payload);
            if (response?.config) {
                this.populateConfigForm(response.config);
                this.applyPollingIntervalFromConfig(response.config);
            } else {
                this.startPolling(pollIntervalMs);
            }
            const hostHint = `${targetHost || '0.0.0.0'}:${targetPort || '5000'}`;
            this.showNotification({
                title: 'Configuration Saved',
                message: `Reload in progress. Access the dashboard at http://${hostHint}/ once it comes back online.`,
                tone: 'success'
            });
            setTimeout(() => this.closeConfigDialog(), 4000);
        } catch (error) {
            console.error('Failed to update configuration:', error);
            this.showNotification({
                title: 'Save Failed',
                message: error.message || 'Your changes could not be saved.',
                tone: 'error'
            });
        } finally {
            this.toggleConfigLoading(false);
        }
    },

    setPollIntervalControlFromMs(ms) {
        const input = this.configInputs?.pollInterval;
        if (!input) return;

        const defaultsMs = this.pollIntervalMs || 1000;
        const baseMs = typeof ms === 'number' && !Number.isNaN(ms) && ms > 0 ? ms : defaultsMs;
        const seconds = Math.round(baseMs / 1000);
        const min = Number(input.min) || 1;
        const max = Number(input.max) || 60;
        const clamped = Math.min(Math.max(seconds, min), max);
        input.value = String(clamped);
        this.updatePollIntervalPreview(clamped);
    },

    updatePollIntervalPreview(seconds) {
        const label = this.configInputs?.pollIntervalLabel;
        const clamped = Math.max(1, Math.round(Number(seconds) || 1));
        if (label) {
            label.textContent = `${clamped}s`;
        }
    },

    applyPollingIntervalFromConfig(cfg, options = {}) {
        const provided = Number(cfg?.poll_interval_ms);
        let desired = Number.isFinite(provided) && provided > 0 ? provided : this.pollIntervalMs || 1000;
        if (desired < 500) {
            desired = 500;
        }

        if (options.updateControl !== false) {
            this.setPollIntervalControlFromMs(desired);
        }

        const changed = desired !== this.pollIntervalMs;
        this.pollIntervalMs = desired;

        if (options.restart !== false && changed) {
            this.startPolling(desired);
        }
    },

    populateConfigForm(cfg) {
        if (!cfg) return;
        if (this.configInputs.routerHost) this.configInputs.routerHost.value = cfg.router_host ?? '';
        if (this.configInputs.routerUser) this.configInputs.routerUser.value = cfg.router_user ?? '';
        if (this.configInputs.routerPassword) this.configInputs.routerPassword.value = cfg.router_password ?? '';
        if (this.configInputs.listenHost) this.configInputs.listenHost.value = cfg.listen_host ?? '';
        if (this.configInputs.listenPort) this.configInputs.listenPort.value = cfg.listen_port ?? '';
        this.setPollIntervalControlFromMs(cfg.poll_interval_ms);
    },

    toggleConfigLoading(isLoading, pendingLabel = 'Saving...') {
        if (this.configSaveBtn) {
            this.configSaveBtn.disabled = isLoading;
            this.configSaveBtn.textContent = isLoading ? pendingLabel : 'Save Changes';
        }
        if (this.configCancelBtn) {
            this.configCancelBtn.disabled = isLoading;
            this.configCancelBtn.classList.toggle('opacity-60', isLoading);
            this.configCancelBtn.classList.toggle('cursor-not-allowed', isLoading);
        }
    },

    startPolling(interval) {
        const sanitized = Math.max(500, Number(interval) || this.pollIntervalMs || 1000);
        this.pollIntervalMs = sanitized;

        // Clear any existing interval
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            try {
                await this.loadData();
                await this.loadDailyUsage();
            } catch (error) {
                console.error("Polling error:", error);
                // Consider adding retry logic or error notification
            }
        }, sanitized);
    }
};

// Dialog functionality
async function handleRenewIp() {
    const resetIpBtn = document.getElementById('resetIp');
    const rebootBtn = document.getElementById('rebootBtn');

    if (resetIpBtn) {
        resetIpBtn.disabled = true;
        resetIpBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }
    if (rebootBtn) {
        rebootBtn.disabled = true;
        rebootBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    const loadingToast = App.showNotification({
        title: 'Renewing WAN IP',
        message: 'Stand by while we fetch a fresh public IP...',
        tone: 'info',
        duration: 0,
    });

    try {
        const currentStatus = await API.getPreloginStatus();
        const oldIp = currentStatus?.wan_conns?.[0]?.ipConns?.[0]?.ExternalIPAddress || 'unknown';

        await API.setApnInternet('internet');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await API.setApnInternet('xlunlimited');
        await new Promise((resolve) => setTimeout(resolve, 1000));

        let newIp = null;
        let attempts = 0;
        const maxAttempts = 30;

        while (!newIp && attempts < maxAttempts) {
            attempts++;
            const status = await API.getPreloginStatus();
            const candidate = status?.wan_conns?.[0]?.ipConns?.[0]?.ExternalIPAddress || null;
            if (candidate && candidate !== oldIp) {
                newIp = candidate;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (newIp) {
            App.showNotification({
                title: 'WAN IP Renewed',
                message: `New public IP acquired: ${newIp}.`,
                tone: 'success',
            });
        } else {
            App.showNotification({
                title: 'Renewal Timed Out',
                message: 'Could not detect a new IP after multiple attempts. Please try again later.',
                tone: 'error',
            });
        }
    } catch (error) {
        console.error('Error during IP reset:', error);
        App.showNotification({
            title: 'Renew Failed',
            message: error.message || 'Unexpected error while renewing WAN IP.',
            tone: 'error',
        });
    } finally {
        if (loadingToast && loadingToast.dismiss) {
            loadingToast.dismiss();
        }

        if (resetIpBtn) {
            resetIpBtn.disabled = false;
            resetIpBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
        if (rebootBtn) {
            rebootBtn.disabled = false;
            rebootBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

async function handleRebootDevice() {
    const rebootBtn = document.getElementById('rebootBtn');
    if (rebootBtn) {
        rebootBtn.disabled = true;
        rebootBtn.classList.add('opacity-60', 'cursor-not-allowed');
    }

    const loadingToast = App.showNotification({
        title: 'Rebooting Router',
        message: 'Sending reboot command. The device will be unavailable momentarily.',
        tone: 'info',
        duration: 0,
    });

    try {
        await API.doReboot();
        App.showNotification({
            title: 'Reboot Command Sent',
            message: 'Router is restarting. Please allow 1-2 minutes before reconnecting.',
            tone: 'success',
        });
    } catch (error) {
        console.error('Error during reboot:', error);
        App.showNotification({
            title: 'Reboot Failed',
            message: error.message || 'Unable to reboot the device.',
            tone: 'error',
        });
    } finally {
        if (loadingToast && loadingToast.dismiss) {
            loadingToast.dismiss();
        }

        if (rebootBtn) {
            rebootBtn.disabled = false;
            rebootBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
}

async function showSmsDialog() {
    const smsDialog = document.getElementById('smsDialog');
    if (!smsDialog) return;
    smsDialog.classList.add('active');
    renderSmsDialog();
}

function renderSmsDialog() {
    const smsDialog = document.getElementById('smsDialog');
    const smsList = document.getElementById('smsList');
    const smsTotalCount = document.getElementById('smsTotalCount');
    const smsUnreadCount = document.getElementById('smsUnreadCount');
    const smsBadge = document.getElementById('smsBadge');
    const deleteAllBtn = document.getElementById('smsDeleteAllBtn');

    smsDialog.classList.add('active');
    if (!DOM.smsData) return;

    if (deleteAllBtn && !deleteAllBtn.dataset.defaultContent) {
        deleteAllBtn.dataset.defaultContent = deleteAllBtn.innerHTML;
    }

    const renderEmptyState = () => {
        smsList.innerHTML = '<p class="text-xs text-gray-400 text-center border border-dashed border-[#3a3a3a] rounded-lg px-3 py-4">No SMS messages.</p>';
    };

    const updateCounters = () => {
        const totalCount = DOM.smsData.length;
        const unreadCount = DOM.smsData.filter((item) => item.SMSUnread).length;

        smsTotalCount.textContent = totalCount;
        smsUnreadCount.textContent = unreadCount;
        if (deleteAllBtn) {
            const hasMessages = totalCount > 0;
            deleteAllBtn.disabled = !hasMessages;
            deleteAllBtn.classList.toggle('hidden', !hasMessages);
        }

        if (smsBadge) {
            if (unreadCount > 0) {
                smsBadge.textContent = unreadCount;
                smsBadge.classList.remove('hidden');
            } else {
                smsBadge.textContent = '0';
                smsBadge.classList.add('hidden');
            }
        }

        return { totalCount, unreadCount };
    };

    const counts = updateCounters();

    smsList.innerHTML = '';
    if (counts.totalCount === 0) {
        renderEmptyState();
        return;
    }

    DOM.smsData.forEach((sms) => {
        const smsItem = document.createElement('div');
        smsItem.className = `p-3 rounded-lg border ${sms.SMSUnread ? 'bg-blue-900 border-blue-700' : 'bg-[#282828] border-gray-600'}`;
        smsItem.dataset.smsid = sms.SMSID;

        const wrapper = document.createElement('div');
        wrapper.className = 'flex justify-between items-start gap-3';

        const content = document.createElement('div');
        content.className = `flex-1 ${sms.SMSUnread ? 'cursor-pointer' : ''}`;
        content.innerHTML = `
            <p class="font-semibold text-white">${DOM.escapeHtml(sms.SMSSender || 'Unknown')}</p>
            <p class="text-gray-400 text-sm mt-1">${new Date(sms.SMSDateTime).toLocaleString()}</p>
            <p class="text-gray-300 mt-2 whitespace-pre-wrap break-words">${DOM.escapeHtml(sms.SMSContent || '')}</p>
        `;

        const actions = document.createElement('div');
        actions.className = 'flex flex-col items-end gap-2';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'inline-flex items-center gap-2 rounded-md border border-red-500/60 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-60';
        deleteBtn.innerHTML = `
            <span class="flex items-center gap-1">
                <i class="fas fa-times text-xs"></i>
            </span>
        `;

        actions.appendChild(deleteBtn);
        wrapper.appendChild(content);
        wrapper.appendChild(actions);
        smsItem.appendChild(wrapper);
        smsList.appendChild(smsItem);

        if (sms.SMSUnread) {
            content.addEventListener('click', async () => {
                try {
                    await API.setSmsState(sms.SMSID, false);
                    sms.SMSUnread = false;
                    smsItem.classList.remove('bg-blue-900', 'border-blue-700');
                    smsItem.classList.add('bg-[#282828]', 'border-gray-600');
                    content.classList.remove('cursor-pointer');
                    updateCounters();
                    App.showNotification({
                        title: 'SMS marked as read',
                        message: sms.SMSSender ? `From ${sms.SMSSender}` : undefined,
                        tone: 'success'
                    });
                } catch (error) {
                    console.error('Error marking SMS as read:', error);
                }
            });
        }

        deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (deleteBtn.disabled) return;

            setButtonLoadingState(deleteBtn, true, { loadingText: 'Deleting…', spinnerColor: 'text-red-200' });
            try {
                await API.deleteSms(sms.SMSID);
                DOM.smsData = DOM.smsData.filter((item) => item.SMSID !== sms.SMSID);
                smsItem.remove();

                const { totalCount } = updateCounters();
                if (totalCount === 0) {
                    renderEmptyState();
                }

                App.showNotification({
                    title: 'SMS deleted',
                    tone: 'success'
                });
            } catch (error) {
                console.error('Error deleting SMS:', error);
                App.showNotification({
                    title: 'Failed to delete SMS',
                    message: error.message || 'Unable to delete message.',
                    tone: 'error'
                });
            } finally {
                if (deleteBtn.isConnected) {
                    setButtonLoadingState(deleteBtn, false);
                }
            }
        });
    });

    if (deleteAllBtn) {
        deleteAllBtn.onclick = async (event) => {
            event.preventDefault();
            if (deleteAllBtn.disabled) return;
            if (!window.confirm('Delete all SMS messages? This cannot be undone.')) {
                return;
            }

            setButtonLoadingState(deleteAllBtn, true, { loadingText: 'Deleting…', spinnerColor: 'text-red-200' });
            try {
                await API.deleteSms([], { deleteAll: true });
                DOM.smsData = [];
                renderEmptyState();
                updateCounters();
                App.showNotification({
                    title: 'All SMS deleted',
                    tone: 'success'
                });
            } catch (error) {
                console.error('Error deleting all SMS:', error);
                App.showNotification({
                    title: 'Failed to delete all SMS',
                    message: error.message || 'Unable to delete all messages.',
                    tone: 'error'
                });
            } finally {
                setButtonLoadingState(deleteAllBtn, false);
                if (DOM.smsData.length === 0) {
                    deleteAllBtn.classList.add('hidden');
                }
            }
        };
    }
}

function hideSmsDialog() {
    const dialog = document.getElementById('smsDialog');
    dialog.classList.remove('active');
}

function initLedSwitchControl() {
    const ledSwitch = document.getElementById('ledSwitch');
    if (!ledSwitch) return;

    const switchLabel = ledSwitch.parentElement;
    const storageKey = 'nokia-led-switch-state';

    const setDisabled = (disabled) => {
        ledSwitch.disabled = disabled;
        if (switchLabel) {
            switchLabel.classList.toggle('pointer-events-none', disabled);
            switchLabel.classList.toggle('opacity-60', disabled);
        }
    };

    try {
        const savedState = localStorage.getItem(storageKey);
        if (savedState !== null) {
            ledSwitch.checked = savedState === 'true';
        }
    } catch (_) {
        // Ignore storage errors (e.g., private mode restrictions)
    }

    let isUpdating = false;

    const toBool = (value) => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (!normalized) {
                return false;
            }
            if (['true', 'on', 'enabled', 'enable', 'yes', '1'].includes(normalized)) {
                return true;
            }
            if (['false', 'off', 'disabled', 'disable', 'no', '0'].includes(normalized)) {
                return false;
            }
            const numeric = Number(value);
            return !Number.isNaN(numeric) && numeric !== 0;
        }
        return Boolean(value);
    };

    const parseLedState = (data) => {
        if (!data || typeof data !== 'object') {
            return null;
        }

        if (typeof data.enabled === 'boolean') {
            return data.enabled;
        }
        if (typeof data.enabled === 'number') {
            return data.enabled !== 0;
        }

        if (typeof data.status_led !== 'undefined' && typeof data.signal_led !== 'undefined') {
            return toBool(data.status_led) && toBool(data.signal_led);
        }

        const ledGlobal = data.LEDGlobalSts;
        if (ledGlobal && typeof ledGlobal === 'object') {
            const status = toBool(ledGlobal.X_ALU_COM_StatusLED_Enable);
            const signal = toBool(ledGlobal.X_ALU_COM_SignalLED_Enable);
            if (typeof ledGlobal.X_ALU_COM_StatusLED_Enable !== 'undefined' || typeof ledGlobal.X_ALU_COM_SignalLED_Enable !== 'undefined') {
                return status && signal;
            }
        }

        return null;
    };

    (async () => {
        isUpdating = true;
        setDisabled(true);
        try {
            const response = await API.getCurrentLedState();
            const current = parseLedState(response);
            if (current !== null) {
                ledSwitch.checked = current;
                try {
                    localStorage.setItem(storageKey, String(current));
                } catch (_) {
                    // Ignore storage errors
                }
            }
        } catch (error) {
            console.error('Failed to fetch current LED state:', error);
        } finally {
            setDisabled(false);
            isUpdating = false;
        }
    })();

    ledSwitch.addEventListener('change', async () => {
        if (isUpdating) return;

        const desiredState = ledSwitch.checked;
        isUpdating = true;
        setDisabled(true);

        try {
            await API.setLedState(desiredState);

            try {
                localStorage.setItem(storageKey, String(desiredState));
            } catch (_) {
                // Ignore storage errors
            }

            App.showNotification({
                title: 'LEDs Updated',
                message: desiredState ? 'Device LEDs enabled.' : 'Device LEDs disabled.',
                tone: 'success'
            });
        } catch (error) {
            console.error('Failed to update LED state:', error);
            ledSwitch.checked = !desiredState;

            try {
                localStorage.setItem(storageKey, String(ledSwitch.checked));
            } catch (_) {
                // Ignore storage errors
            }

            App.showNotification({
                title: 'LED Update Failed',
                message: error.message || 'Unable to change LED state.',
                tone: 'error'
            });
        } finally {
            setDisabled(false);
            isUpdating = false;
        }
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Reset IP button
    const resetIpBtn = document.getElementById('resetIp');
    if (resetIpBtn) {
        resetIpBtn.addEventListener('click', handleRenewIp);
    }

    const refreshIpBtn = document.getElementById('refreshIp');
    if (refreshIpBtn) {
        refreshIpBtn.addEventListener('click', handleRenewIp);
    }

    // Reboot device
    const rebootBtn = document.getElementById('rebootBtn');
    if (rebootBtn) {
        rebootBtn.addEventListener('click', handleRebootDevice);
    }

    // SMS button
    const smsIcon = document.getElementById('smsIcon');
    const smsCloseDialog = document.getElementById('smsCloseDialog');
    if (smsIcon) {
        smsIcon.addEventListener('click', showSmsDialog);
    }
    smsCloseDialog.addEventListener('click', hideSmsDialog);

    // Close dialog buttons
    // Legacy close dialog buttons (kept for backwards compatibility)
    const closeButtons = [
        document.getElementById('closeDialog'),
        document.getElementById('closeDialogBtn')
    ];

    closeButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', () => {
                const overlay = document.getElementById('infoDialog');
                if (overlay) {
                    overlay.classList.remove('active');
                }
            });
        }
    });

    initLedSwitchControl();
});

// Data expiration functionality
const ExpirationManager = {
    init() {
        if (!this.ensureElementsExist()) {
            console.error('Required elements for ExpirationManager not found');
            return;
        }

        this.setupEventListeners();
        this.loadAndUpdateExpiration();
    },

    ensureElementsExist() {
        const requiredElements = [
            'dataExpired',
            'expirationDialog',
            'closeExpirationDialog',
            'extend30Days',
            'saveExpirationDate',
            'expirationDate'
        ];

        return requiredElements.every(id => {
            const element = document.getElementById(id);
            if (!element) {
                console.warn(`Element with ID ${id} not found`);
                return false;
            }
            return true;
        });
    },

    setupEventListeners() {
        const dataExpiredElement = document.getElementById('dataExpired');
        const closeExpirationDialog = document.getElementById('closeExpirationDialog');
        const extend30DaysBtn = document.getElementById('extend30Days');
        const saveExpirationDateBtn = document.getElementById('saveExpirationDate');

        dataExpiredElement.style.cursor = 'pointer';
        dataExpiredElement.addEventListener('click', () => this.showExpirationDialog());

        closeExpirationDialog.addEventListener('click', () => this.hideExpirationDialog());
        extend30DaysBtn.addEventListener('click', () => this.extend30Days());
        saveExpirationDateBtn.addEventListener('click', () => this.saveExpirationDate());
    },

    async loadAndUpdateExpiration() {
        try {
            const response = await API.getDataExpired();
            this.updateExpirationDisplay(response);
        } catch (error) {
            console.error('Error loading expiration date:', error);
            this.updateExpirationDisplay(0);
        }
    },

    showExpirationDialog() {
        const dialog = document.getElementById('expirationDialog');
        const expirationDateInput = document.getElementById('expirationDate');

        const currentExpiration = this.getCurrentExpirationDate();
        if (currentExpiration) {
            expirationDateInput.valueAsDate = currentExpiration;
        } else {
            expirationDateInput.value = '';
        }

        dialog.classList.add('active');
    },

    hideExpirationDialog() {
        const dialog = document.getElementById('expirationDialog');
        dialog.classList.remove('active');
    },

    async extend30Days() {
        const expirationDateInput = document.getElementById('expirationDate');
        let newDate = new Date();

        newDate.setDate(newDate.getDate() + 30);
        expirationDateInput.valueAsDate = newDate;

        const selectedDate = expirationDateInput.valueAsDate;
        const timestamp = Math.floor(selectedDate.getTime() / 1000);

        try {
            await API.setDataExpired(timestamp);

            this.updateExpirationDisplay(timestamp);
            this.hideExpirationDialog();
        } catch (error) {
            console.error('Error saving expiration date:', error);
            alert('Failed to save expiration date: ' + error.message);
        }
    },

    async saveExpirationDate() {
        const expirationDateInput = document.getElementById('expirationDate');

        if (!expirationDateInput.value) {
            alert('Please select a date or click "Extend 30 Days"');
            return;
        }

        const selectedDate = expirationDateInput.valueAsDate;
        const timestamp = Math.floor(selectedDate.getTime() / 1000);

        try {
            await API.setDataExpired(timestamp);

            this.updateExpirationDisplay(timestamp);
            this.hideExpirationDialog();
        } catch (error) {
            console.error('Error saving expiration date:', error);
            alert('Failed to save expiration date: ' + error.message);
        }
    },

    getCurrentExpirationDate() {
        const dataExpiredElement = document.getElementById('dataExpired');
        const timestampStr = dataExpiredElement.dataset.expirationTimestamp;
        return timestampStr ? new Date(parseInt(timestampStr) * 1000) : null;
    },

    updateExpirationDisplay(timestamp) {
        const dataExpiredElement = document.getElementById('dataExpired');

        if (!timestamp || timestamp <= 0) {
            dataExpiredElement.textContent = 'Not set';
            dataExpiredElement.className = 'font-semibold text-xs text-gray-400';
            dataExpiredElement.dataset.expirationTimestamp = '';
            return;
        }

        const expirationDate = new Date(timestamp * 1000);
        const now = new Date();
        const timeDiff = expirationDate - now;
        const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        dataExpiredElement.dataset.expirationTimestamp = timestamp;

        const formattedDate = expirationDate.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short'
        });

        if (timeDiff <= 0) {
            dataExpiredElement.textContent = 'Expired';
            dataExpiredElement.className = 'font-semibold text-xs text-red-500';
        } else {
            let textColor = 'text-white';

            if (daysDiff <= 3) {
                textColor = 'text-red-500';
            } else if (daysDiff <= 7) {
                textColor = 'text-yellow-500';
            } else {
                textColor = 'text-green-500';
            }

            dataExpiredElement.textContent = `${formattedDate} (${daysDiff} days remaining)`;
            dataExpiredElement.className = `font-semibold text-xs ${textColor}`;
        }
    }
};

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
