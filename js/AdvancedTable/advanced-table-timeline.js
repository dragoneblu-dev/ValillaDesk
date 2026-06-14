/**
 * AdvancedTableTimeline.js
 * Core Modulo Timeline: Gestione Math (Date->Pixel), Zoom e Menu.
 */

const AdvancedTimeline = {
    dragState: null,
    dragTooltip: null,
    panState: null,
    preservedCenterMs: undefined,
    linkDragState: null,

    _getPxFromDate: (targetMs, startDateMs, colWidth) => {
        const dTarget = new Date(targetMs);
        const dStart = new Date(startDateMs);
        const utcStart = Date.UTC(dStart.getFullYear(), dStart.getMonth(), dStart.getDate());
        const utcTarget = Date.UTC(dTarget.getFullYear(), dTarget.getMonth(), dTarget.getDate());
        const daysDiff = (utcTarget - utcStart) / 86400000;
        const fraction = (dTarget.getHours() + dTarget.getMinutes() / 60 + dTarget.getSeconds() / 3600) / 24;
        return (daysDiff + fraction) * colWidth;
    },

    _getDateFromPx: (px, startDateMs, colWidth) => {
        const dStart = new Date(startDateMs);
        const daysDiff = Math.floor(px / colWidth);
        const fraction = (px % colWidth) / colWidth;
        const target = new Date(dStart.getFullYear(), dStart.getMonth(), dStart.getDate() + daysDiff);
        const totalHours = fraction * 24;
        const hours = Math.floor(totalHours);
        const minutes = Math.round((totalHours - hours) * 60);
        target.setHours(hours, minutes, 0, 0);
        return target.getTime();
    },

    _snapDate: (dateMs, snapMs) => {
        const d = new Date(dateMs);
        if (snapMs >= 86400000) { 
            d.setHours(0, 0, 0, 0);
            if (d.getHours() === 23) {
                d.setHours(d.getHours() + 2);
                d.setHours(0, 0, 0, 0);
            }
            return d.getTime();
        }
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const msSinceStartOfDay = dateMs - startOfDay;
        const snappedMs = Math.round(msSinceStartOfDay / snapMs) * snapMs;
        return startOfDay + snappedMs;
    },

    _getDynamicSnapMs: (colWidth, colType) => {
        const dayMs = 24 * 60 * 60 * 1000;
        if (colType !== 'datetime') return dayMs; 
        if (colWidth >= 400) return 15 * 60 * 1000;        
        if (colWidth >= 200) return 30 * 60 * 1000;        
        if (colWidth >= 100) return 60 * 60 * 1000;        
        if (colWidth >= 80)  return 3 * 60 * 60 * 1000;    
        if (colWidth >= 50)  return 6 * 60 * 60 * 1000;    
        return 12 * 60 * 60 * 1000;                        
    },

    navigate: (tableId, direction) => {
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!scrollArea) return;
        const shiftAmount = scrollArea.clientWidth * 0.75 * direction;
        
        const state = AdvancedTable.getState(tableId);
        const colWidth = state.timelineZoom || 40;
        const startDateMs = Number(scrollArea.dataset.startDate);
        
        const targetScrollLeft = scrollArea.scrollLeft + shiftAmount;
        const centerPx = targetScrollLeft + (scrollArea.clientWidth / 2);
        AdvancedTimeline.preservedCenterMs = AdvancedTimeline._getDateFromPx(centerPx, startDateMs, colWidth);
        
        scrollArea.scrollBy({ left: shiftAmount, behavior: 'smooth' });
    },

    scrollToToday: (tableId) => {
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        if (!scrollArea) return;
        const state = AdvancedTable.getState(tableId);
        const colWidth = state.timelineZoom || 40;
        const startDateMs = Number(scrollArea.dataset.startDate);
        const todayMs = new Date().getTime();
        const targetPx = AdvancedTimeline._getPxFromDate(todayMs, startDateMs, colWidth);
        scrollArea.scrollTo({ left: targetPx - (scrollArea.offsetWidth * 0.2), behavior: 'smooth' });
    },

    openZoomMenu: (e, tableId) => {
        e.stopPropagation();
        UI.Menu.closeAll(true);
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        const viewWidth = scrollArea ? scrollArea.clientWidth : window.innerWidth * 0.8;
        
        const presetDay = Math.round(viewWidth / 1);
        const presetWeek = Math.round(viewWidth / 7);
        const presetMonth = Math.round(viewWidth / 30);
        const presetQuarter = Math.round(viewWidth / 90);

        const menuItems =[
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Zoom Preimpostato:</div>' },
            { icon: Icons.time, label: 'Vista a 1 Giorno (24h)', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetDay) },
            { icon: Icons.viewCalendar, label: 'Vista a 1 Settimana', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetWeek) },
            { icon: Icons.viewTimeline, label: 'Vista a 1 Mese', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetMonth) },
            { icon: Icons.viewBoard, label: 'Vista a 1 Trimestre', onClick: () => AdvancedTimeline.setZoomExact(tableId, presetQuarter) }
        ];

        UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
    },

    setZoomExact: (tableId, exactPx) => {
        let state = AdvancedTable.getState(tableId);
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        
        if (scrollArea) {
            const colWidth = state.timelineZoom || 40;
            const startDateMs = Number(scrollArea.dataset.startDate);
            const centerPx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
            AdvancedTimeline.preservedCenterMs = AdvancedTimeline._getDateFromPx(centerPx, startDateMs, colWidth);
        }

        let newZoom = exactPx;
        if (newZoom < 15) newZoom = 15;
        if (newZoom > 1200) newZoom = 1200;

        state.timelineZoom = newZoom;
        AdvancedTable.setState(tableId, state);
        AdvancedTable.renderTable(tableId);
    },

    changeZoom: (tableId, delta) => {
        const scrollArea = document.getElementById(`timeline-scroll-${tableId}`);
        let centerMs = null;
        let startDateMs = null;
        let state = AdvancedTable.getState(tableId);
        let currentZoom = state.timelineZoom || 40;

        if (scrollArea) {
            startDateMs = Number(scrollArea.dataset.startDate);
            const centerPx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2);
            centerMs = AdvancedTimeline._getDateFromPx(centerPx, startDateMs, currentZoom);
        }

        let step = 10;
        if (currentZoom >= 100) step = 40;
        if (currentZoom >= 300) step = 100;

        currentZoom += (delta > 0 ? step : -step);

        if (currentZoom < 15) currentZoom = 15;
        if (currentZoom > 1200) currentZoom = 1200;

        state.timelineZoom = currentZoom;
        AdvancedTable.setState(tableId, state);
        if (centerMs) AdvancedTimeline.preservedCenterMs = centerMs;
        AdvancedTable.renderTable(tableId);
    },

    openGroupMenu: (e, tableId) => {
        e.stopPropagation();
        const state = AdvancedTable.getState(tableId);
        const chk = '<span style="color:var(--accent-color); font-weight:bold; float:right; margin-left:10px;">✓</span>';

        const menuItems =[
            { type: 'custom', html: '<div class="adv-dropdown-title" style="padding:0 4px; margin-bottom:4px;">Raggruppa Timeline per:</div>' },
            { icon: Icons.viewList, label: 'Nessun Raggruppamento' + (!state.timelineGroupBy ? chk : ''), onClick: () => AdvancedTimeline.setGroupBy(tableId, null) },
            { type: 'divider' }
        ];

        const groupableCols = state.columns.filter(c => c.id === state.columns[0].id || c.type === 'select' || c.type === 'relation');
        if (groupableCols.length === 0) {
            menuItems.push({ type: 'custom', html: '<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px;">Nessuna colonna adatta trovata.</div>' });
        } else {
            groupableCols.forEach(c => {
                const isActive = state.timelineGroupBy === c.id;
                let icon = c.type === 'select' ? Icons.select : Icons.relation;
                if (c.id === state.columns[0].id) icon = Icons.text;
                menuItems.push({ icon: icon, label: c.name + (isActive ? chk : ''), onClick: () => AdvancedTimeline.setGroupBy(tableId, c.id) });
            });
        }
        UI.Menu.buildContextMenu(e.currentTarget.id, menuItems);
    },

    setGroupBy: (tableId, colId) => {
        let state = AdvancedTable.getState(tableId);
        state.timelineGroupBy = colId;
        AdvancedTable.setState(tableId, state);
        Store.triggerAutoSave();
        UI.Menu.closeAll(true);
        AdvancedTable.renderTable(tableId);
    }
};