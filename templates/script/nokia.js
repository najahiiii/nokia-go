// API Client Utilities
const API = {
    baseUrl: `${window.location.origin}/api`,
    // baseUrl: "http://192.168.1.69:5000/api",

    async fetchData(endpoint, args = "") {
        const url = `${this.baseUrl}/${endpoint}${args ? '?' + args : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
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

    getServiceData() {
        return this.fetchData('service_data');
    },

    getStatusWeb() {
        return this.fetchData('status_web');
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

    getCellularIdentity() {
        return this.fetchData('cell_identification');
    },

    getDataExpired() {
        return this.fetchData('get_data_expired');
    },

    setDataExpired(data_expired) {
        return this.fetchData('set_data_expired', `data_expired=${encodeURIComponent(data_expired)}`);
    },
};

// DOM Utilities
const DOM = {
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
            this.setTextContent('wanIp', data.wan_conns[0].ipConns[0].ExternalIPAddress);
        }

        if (data.wan_conns?.[0]?.ipConns?.[0]) {
            const dnsList = data.wan_conns[0].ipConns[0].DNSServers.split(" ");
            const dnsContainer = document.getElementById('dnsServer');

            dnsContainer.innerHTML = `
                <span class="font-semibold text-xs">DNS Server</span>
                <div class="flex flex-col text-right">
                    ${dnsList.map(dns => `<span class="font-semibold text-xs">${dns}</span>`).join('')}
                </div>
            `;
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

        // Store SMS data for dialog
        this.smsData = smsList;
    },
};

// Main Application
const App = {
    async init() {
        try {
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

            // Set up polling
            this.startPolling(1000);
        } catch (error) {
            console.error("Initialization error:", error);
            // Consider adding user-facing error notification here
        }
    },

    async loadData() {
        const status = await API.getPreloginStatus();
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
    },

    async loadDailyUsage() {
        const cellIdentity = await API.getCellularIdentity();
        const dailyUsage = await API.getFormattedDailyUsage();
        DOM.updateCellularIdentity(cellIdentity);
        DOM.renderDailyUsageChart(dailyUsage);
        document.getElementById('cellTotalDl').textContent = dailyUsage?.last_7_days?.[0]?.download?.formatted || '0 B';
        document.getElementById('cellTotalUl').textContent = dailyUsage?.last_7_days?.[0]?.upload?.formatted || '0 B';
        document.getElementById('totalUsage').textContent = dailyUsage?.total_usage?.combined || '0 B';
    },

    startPolling(interval) {
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
        }, interval);
    }
};

// Dialog functionality
async function showResetIpDialog() {
    const resetIpBtn = document.getElementById('resetIp');
    const rebootBtn = document.getElementById('rebootBtn');
    const dialog = document.getElementById('infoDialog');
    const dialogStatus = document.getElementById('dialogStatus');
    const closeDialogBtn = document.getElementById('closeDialogBtn');
    const closeDialog = document.getElementById('closeDialog');

    // Reset dialog content and hide close button initially
    dialogStatus.innerHTML = '';
    closeDialogBtn.classList.add('hidden');
    document.getElementById("dialogTitle").textContent = 'Reset IP';
    document.getElementById("dialogInfo").textContent = 'Please wait until new public IP shows up';

    // Disable close functionality during process
    resetIpBtn.style.pointerEvents = 'none';
    rebootBtn.style.pointerEvents = 'none';
    closeDialogBtn.style.pointerEvents = 'none';
    closeDialog.style.pointerEvents = 'none';
    dialog.style.pointerEvents = 'none';

    // Show dialog
    dialog.classList.add('active');

    // Add loading animation
    const loadingHtml = `<div id="loading" class="flex justify-center my-4">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                         </div>`;
    dialogStatus.insertAdjacentHTML('beforeend', loadingHtml);

    try {
        // IP reset process
        const currentStatus = await API.getPreloginStatus();
        const oldIp = currentStatus?.wan_conns?.[0]?.ipConns?.[0]?.ExternalIPAddress;
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Current public IP is <b>${oldIp}</b></p>`);

        // Reset IP by changing APN
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Restarting [1]...</p>`);
        await API.setApnInternet("internet");

        // Wait 1 second between APN changes
        await new Promise(resolve => setTimeout(resolve, 1000));

        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Restarting [2]...</p>`);
        await API.setApnInternet("xlunlimited");

        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Restart OK, waiting for new IP...</p>`);

        // Wait 1 second before starting IP check
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Poll until new IP is available
        let newIp = null;
        let attempts = 0;
        const maxAttempts = 30;

        while (!newIp && attempts < maxAttempts) {
            attempts++;
            const status = await API.getPreloginStatus();
            newIp = status?.wan_conns?.[0]?.ipConns?.[0]?.ExternalIPAddress || null;

            if (!newIp) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else if (oldIp === newIp) {
                newIp = null;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (newIp) {
            dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- New public IP is <b>${newIp}</b></p>`);
        } else {
            dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-red-400">- Failed to get new IP after ${maxAttempts} attempts</p>`);
        }
    } catch (error) {
        console.error('Error during IP reset:', error);
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-red-400">- Error: ${error.message}</p>`);
    } finally {
        // Remove loading animation when done
        const loading = document.getElementById('loading');
        if (loading) loading.remove();

        // Show close button after all steps are done
        closeDialogBtn.classList.remove('hidden');

        // Restore close functionality
        resetIpBtn.style.pointerEvents = 'auto';
        rebootBtn.style.pointerEvents = 'auto';
        closeDialogBtn.style.pointerEvents = 'auto';
        closeDialog.style.pointerEvents = 'auto';
        dialog.style.pointerEvents = 'auto';
    }
}

function hideResetIpDialog() {
    const dialog = document.getElementById('infoDialog');
    const closeDialogBtn = document.getElementById('closeDialogBtn');
    const closeDialog = document.getElementById('closeDialog');

    // Only allow closing if the button is visible (process complete)
    if (!closeDialogBtn.classList.contains('hidden')) {
        dialog.classList.remove('active');

        // Clear the status messages for next time
        document.getElementById('dialogStatus').innerHTML = '';

        // Ensure close button is hidden again for next time
        closeDialogBtn.classList.add('hidden');

        // Restore pointer events (in case they were disabled)
        closeDialogBtn.style.pointerEvents = 'auto';
        closeDialog.style.pointerEvents = 'auto';
        dialog.style = '';
    }
}

async function showRebootDialog() {
    const rebootBtn = document.getElementById('rebootBtn');
    const dialog = document.getElementById('infoDialog');
    const dialogStatus = document.getElementById('dialogStatus');
    const closeDialogBtn = document.getElementById('closeDialogBtn');
    const closeDialog = document.getElementById('closeDialog');

    // Reset dialog content and hide close button initially
    dialogStatus.innerHTML = '';
    closeDialogBtn.classList.add('hidden');
    document.getElementById("dialogTitle").textContent = 'Reboot Device';
    document.getElementById("dialogInfo").textContent = 'Please wait while the device reboots';

    // Disable close functionality during process
    rebootBtn.style.pointerEvents = 'none';
    closeDialogBtn.style.pointerEvents = 'none';
    closeDialog.style.pointerEvents = 'none';
    dialog.style.pointerEvents = 'none';

    // Show dialog
    dialog.classList.add('active');

    // Add loading animation
    const loadingHtml = `<div id="loading" class="flex justify-center my-4">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                         </div>`;
    dialogStatus.insertAdjacentHTML('beforeend', loadingHtml);

    try {
        // Initiate reboot
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Sending reboot command...</p>`);
        await API.doReboot();

        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Reboot command sent successfully</p>`);
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-gray-300">- Device will restart shortly</p>`);

        // The device will now reboot, so we can't check status anymore
        // Just show a message that the user should wait for the device to come back online
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-blue-400">- Please wait 1-2 minutes for the device to restart</p>`);

    } catch (error) {
        console.error('Error during reboot:', error);
        dialogStatus.insertAdjacentHTML('beforeend', `<p class="text-sm mt-1 text-red-400">- Error: ${error.message}</p>`);
    } finally {
        // Remove loading animation when done
        const loading = document.getElementById('loading');
        if (loading) loading.remove();

        // Show close button after all steps are done
        closeDialogBtn.classList.remove('hidden');

        // Restore close functionality
        rebootBtn.style.pointerEvents = 'auto';
        closeDialogBtn.style.pointerEvents = 'auto';
        closeDialog.style.pointerEvents = 'auto';
        dialog.style.pointerEvents = 'auto';
    }
}

async function showSmsDialog() {
    const smsIcon = document.getElementById('smsIcon');
    const smsDialog = document.getElementById('smsDialog');
    const smsCloseDialog = document.getElementById('smsCloseDialog');
    const smsList = document.getElementById('smsList');
    const smsTotalCount = document.getElementById('smsTotalCount');
    const smsUnreadCount = document.getElementById('smsUnreadCount');

    smsDialog.classList.add('active');
    if (!DOM.smsData) return;

    // Update counts
    const totalCount = DOM.smsData.length;
    const unreadCount = DOM.smsData.filter(sms => sms.SMSUnread).length;

    smsTotalCount.textContent = totalCount;
    smsUnreadCount.textContent = unreadCount;

    // Clear previous list
    smsList.innerHTML = '';

    // Add SMS items
    DOM.smsData.forEach(sms => {
        const smsItem = document.createElement('div');
        smsItem.className = `p-3 rounded-lg border ${sms.SMSUnread ? 'bg-blue-900 border-blue-700' : 'bg-[#282828] border-gray-600'}`;
        smsItem.innerHTML = `
                <div class="flex justify-between items-start cursor-pointer">
                    <div class="flex-1">
                        <p class="font-semibold text-white">${sms.SMSSender || 'Unknown'}</p>
                        <p class="text-gray-400 text-sm mt-1">${new Date(sms.SMSDateTime).toLocaleString()}</p>
                        <p class="text-gray-300 mt-2">${sms.SMSContent}</p>
                    </div>
                </div>
            `;

        // TODO: Add delete func
        // <span class="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">Delete</span>

        // Mark as read when clicked
        if (sms.SMSUnread) {
            smsItem.addEventListener('click', async function() {
                try {
                    await API.setSmsState(sms.SMSID, false);
                    smsItem.classList.remove('bg-blue-900', 'border-blue-700');
                    smsItem.classList.add('bg-[#282828]', 'border-gray-600');
                    sms.SMSUnread = false;

                    // Update badge count
                    const newUnreadCount = DOM.smsData.filter(s => s.SMSUnread).length;
                    document.getElementById('smsBadge').textContent = newUnreadCount;
                    smsUnreadCount.textContent = newUnreadCount;

                    if (newUnreadCount === 0) {
                        document.getElementById('smsBadge').classList.add('hidden');
                    }
                } catch (error) {
                    console.error('Error marking SMS as read:', error);
                }
            });
        }

        smsList.appendChild(smsItem);
    });
}

function hideSmsDialog() {
    const dialog = document.getElementById('smsDialog');
    dialog.classList.remove('active');
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Reset IP button
    const resetIpBtn = document.getElementById('resetIp');
    if (resetIpBtn) {
        resetIpBtn.addEventListener('click', showResetIpDialog);
    }

    // Reboot device
    const rebootBtn = document.getElementById('rebootBtn');
    if (rebootBtn) {
        rebootBtn.addEventListener('click', showRebootDialog);
    }

    // SMS button
    const smsIcon = document.getElementById('smsIcon');
    const smsCloseDialog = document.getElementById('smsCloseDialog');
    if (smsIcon) {
        smsIcon.addEventListener('click', showSmsDialog);
    }
    smsCloseDialog.addEventListener('click', hideSmsDialog);

    // Close dialog buttons
    const closeButtons = [
        document.getElementById('closeDialog'),
        document.getElementById('closeDialogBtn')
    ];

    closeButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', hideResetIpDialog);
        }
    });

    // Close dialog when clicking outside
    const dialogOverlay = document.getElementById('infoDialog');
    if (dialogOverlay) {
        dialogOverlay.addEventListener('click', function(e) {
            if (e.target === dialogOverlay) {
                hideResetIpDialog();
            }
        });
    }
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
