// ==UserScript==
// @id             iitc-plugin-okawari-finder
// @name           IITC plugin: Okawari Finder
// @namespace      https://github.com/k32ru/Okawari-finder
// @category       Layer
// @version        0.4.7
// @description    Pick a 15-portal bookmarked spine and find A bases plus repeat B portals for Orion okawari fields.
// @author         k32ru
// @updateURL      https://github.com/k32ru/Okawari-finder/raw/refs/heads/main/okawari-finder.user.js
// @downloadURL    https://github.com/k32ru/Okawari-finder/raw/refs/heads/main/okawari-finder.user.js
// @homepageURL    https://github.com/k32ru/Okawari-finder
// @supportURL     https://github.com/k32ru/Okawari-finder/issues
// @include        https://*.ingress.com/intel*
// @include        http://*.ingress.com/intel*
// @include        https://intel.ingress.com/*
// @include        http://intel.ingress.com/*
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @match          https://intel.ingress.com/*
// @match          http://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(pluginInfo) {
  'use strict';

  if (typeof window.plugin !== 'function') window.plugin = function () {};

  var self = window.plugin.okawariFinder = {};

  self.title = 'Okawari Finder';
  self.layerGroup = null;
  self.targetLayerGroup = null;
  self.setupDone = false;
  self.bookmarkPortals = [];
  self.selectedSpine = [];
  self.targetsOpen = false;
  self.results = [];
  self.selectedResult = -1;
  self.status = 'idle';
  self.message = '対象ポータルを指定して計画生成してください。';
  self.warnings = [];
  self.storageKey = 'plugin-okawari-finder-target-portals';
  self.previewStorageKey = 'plugin-okawari-finder-plan-preview-state';
  self.uiStorageKey = 'plugin-okawari-finder-ui-settings';
  self.mapPickEnabled = false;
  self.manualAPickEnabled = false;
  self.manualBPickEnabled = false;
  self.settingsOpen = false;
  self.previewState = {
    step: 0,
    agents: {
      A: true,
      B: true,
      C: true
    },
    done: {}
  };

  self.settings = {
    spineSize: 15,
    repeatBases: 10,
    bClusterRadius: 400,
    overlapMeters: 1,
    maxBaseCandidates: 180,
    drawOnMap: true,
    ui: {
      mainPosition: 'left',
      previewPosition: 'right'
    },
    agents: {
      A: 'エージェントA',
      B: 'エージェントB',
      C: 'エージェントC'
    }
  };

  self.colors = {
    A: '#e53935',
    B: '#000000',
    C: '#43a047',
    spine: '#ffd54f',
    base: '#00bcd4',
    label: '#111111'
  };

  self.setup = function () {
    if (self.setupDone) return;
    self.setupDone = true;
    self.injectStyles();
    self.layerGroup = new L.LayerGroup();
    self.targetLayerGroup = new L.LayerGroup();
    window.addLayerGroup(self.title, self.layerGroup, true);
    window.addLayerGroup(self.title + ' 対象ポータル', self.targetLayerGroup, true);
    self.loadUiSettings();
    self.loadPreviewState();
    self.loadStoredTargetPortals();
    if (typeof window.addHook === 'function') window.addHook('portalSelected', self.handlePortalSelected);

    var link = document.createElement('a');
    link.textContent = self.title;
    link.href = '#';
    link.addEventListener('click', function (ev) {
      ev.preventDefault();
      self.openDialog();
    });

    var toolbox = document.getElementById('toolbox');
    if (toolbox) {
      toolbox.appendChild(link);
    } else {
      window.addHook('iitcLoaded', function () {
        var lateToolbox = document.getElementById('toolbox');
        if (lateToolbox) lateToolbox.appendChild(link);
      });
    }
  };

  self.injectStyles = function () {
    if (document.getElementById('okawari-finder-style')) return;
    var style = document.createElement('style');
    style.id = 'okawari-finder-style';
    style.textContent = [
      '.okawari-root{font:12px/1.45 Arial,sans-serif;color:#ddd;}',
      '.okawari-root button,.okawari-root input{font:12px Arial,sans-serif;}',
      '.okawari-root button{background:#10283b;color:#ffe54d;border:1px solid #ffe100;padding:4px 6px;cursor:pointer;}',
      '.okawari-root button:hover{background:#193b55;}',
      '.okawari-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}',
      '.okawari-toolbar label{display:inline-flex;gap:4px;align-items:center;}',
      '.okawari-toolbar input[type=number]{width:62px;}',
      '.okawari-fieldset{border:2px solid rgba(255,255,255,.86);margin:10px 0 12px;padding:10px 12px;background:rgba(18,43,65,.82);}',
      '.okawari-fieldset legend{padding:0 5px;font:bold 14px Arial,sans-serif;color:#f2f2f2;}',
      '.okawari-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 8px;}',
      '.okawari-plan-settings{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:3px 0 10px;}',
      '.okawari-plan-settings label{display:inline-flex;gap:5px;align-items:center;font-weight:bold;}',
      '.okawari-plan-settings input[type=number]{width:72px;background:#13283b;color:#ffe54d;border:1px solid #20394e;padding:3px;}',
      '.okawari-plan-settings input[type=text]{width:120px;background:#13283b;color:#ffe54d;border:1px solid #20394e;padding:3px;}',
      '.okawari-plan-settings select{background:#13283b;color:#ffe54d;border:1px solid #20394e;padding:3px;}',
      '.okawari-side-dialog{box-sizing:border-box;max-height:calc(100vh - 16px)!important;overflow:hidden!important;}',
      '.okawari-side-dialog .ui-dialog-content{box-sizing:border-box;max-height:calc(100vh - 62px)!important;overflow:auto!important;}',
      '.okawari-dialog-left{position:fixed!important;left:8px!important;right:auto!important;top:8px!important;bottom:auto!important;margin:0!important;}',
      '.okawari-dialog-right{position:fixed!important;right:8px!important;left:auto!important;top:8px!important;bottom:auto!important;margin:0!important;}',
      '.okawari-message{padding:8px;margin:8px 0;background:#162531;border:1px solid #3f7191;color:#c8efff;}',
      '.okawari-warning{padding:8px;margin:8px 0;background:#3a2a12;border:1px solid #8a6500;color:#ffd98a;}',
      '.okawari-summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:6px;margin:8px 0;}',
      '.okawari-summary div{background:#1f1f1f;border:1px solid #444;padding:6px;}',
      '.okawari-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '.okawari-panel{border:1px solid #444;background:#1f1f1f;padding:8px;min-width:0;}',
      '.okawari-manual-b{margin-top:8px;background:#122333;border-color:#547999;}',
      '.okawari-panel h4{margin:0 0 6px;font-size:13px;color:#fff;}',
      '.okawari-list{max-height:320px;overflow:auto;border:1px solid #333;background:#181818;}',
      '.okawari-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;padding:4px 6px;border-bottom:1px solid #2b2b2b;}',
      '.okawari-row:hover{background:#2b2b2b;}',
      '.okawari-row.selected{background:#333b28;}',
      '.okawari-muted{color:#aaa;}',
      '.okawari-tablewrap{max-height:260px;overflow:auto;border:1px solid #444;margin-top:10px;}',
      '.okawari-table{width:100%;border-collapse:collapse;}',
      '.okawari-table th,.okawari-table td{border-bottom:1px solid #333;padding:4px 5px;vertical-align:top;}',
      '.okawari-table th{position:sticky;top:0;background:#222;color:#fff;z-index:1;}',
      '.okawari-table tr:hover{background:#2b2b2b;}',
      '.okawari-table .selected{background:#333b28;}',
      '.okawari-target-tablewrap{max-height:260px;overflow:auto;border:1px solid rgba(255,255,255,.35);}',
      '.okawari-target-table{width:100%;border-collapse:collapse;background:rgba(10,22,34,.76);}',
      '.okawari-target-table th,.okawari-target-table td{border-bottom:1px solid rgba(255,255,255,.18);padding:4px 5px;text-align:left;vertical-align:top;}',
      '.okawari-target-table th{position:sticky;top:0;background:#19334b;color:#fff;z-index:1;}',
      '.okawari-target-table tr:hover{background:rgba(255,255,255,.08);}',
      '.okawari-target-name{color:#ffe100!important;font:bold 12px Arial,sans-serif;text-decoration:none;cursor:pointer;}',
      '.okawari-target-name:hover{text-decoration:underline;}',
      '.okawari-target-details{margin-top:8px;}',
      '.okawari-target-details summary{cursor:pointer;font-weight:bold;color:#f5f5f5;margin-bottom:7px;}',
      '.okawari-target-details:not([open]) summary{border:1px solid rgba(255,255,255,.85);border-radius:3px;padding:1px 6px;margin-bottom:0;}',
      '.okawari-target-export{box-sizing:border-box;width:100%;background:#fff;color:#111;border:0;padding:6px;font:12px Consolas,monospace;}',
      '.okawari-detail{margin-top:10px;display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:10px;}',
      '@media(max-width:700px){.okawari-detail{grid-template-columns:1fr}.okawari-output-actions{grid-template-columns:1fr}.okawari-summary{grid-template-columns:1fr 1fr}.okawari-plan-settings{gap:8px}.okawari-plan-settings label{width:100%;justify-content:space-between}.okawari-actions button{min-height:32px}}',
      '.okawari-plan{margin:0;padding-left:20px;}',
      '.okawari-agent-A{color:#ff8a80;}',
      '.okawari-agent-B{color:#82b1ff;}',
      '.okawari-agent-C{color:#a5d6a7;}',
      '.okawari-label{background:rgba(255,255,255,.86);color:#111;border:1px solid #222;border-radius:3px;padding:1px 3px;font:bold 11px Arial,sans-serif;white-space:nowrap;}',
      '.okawari-output-actions{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:8px;margin:8px 0 12px;}',
      '.okawari-output-card{border:1px solid #456981;background:#14283a;padding:8px;}',
      '.okawari-output-card button{margin-bottom:6px;}',
      '.okawari-output-copy details{margin:8px 0;border:1px solid #456981;background:#101f2c;}',
      '.okawari-output-copy summary{cursor:pointer;padding:5px 7px;font-weight:bold;color:#f2f2f2;}',
      '.okawari-output-copy textarea{box-sizing:border-box;width:100%;min-height:170px;background:#fff;color:#111;border:0;padding:6px;font:12px Consolas,monospace;}',
      '.okawari-preview-root{font:14px/1.25 Arial,sans-serif;color:#fff;min-width:0;max-width:980px;}',
      '.okawari-preview-summary{font-weight:bold;margin:4px 0 8px;}',
      '.okawari-preview-step{font-weight:bold;font-size:16px;margin:4px 0;}',
      '.okawari-preview-actions{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0;}',
      '.okawari-preview-actions button{background:#10283b;color:#ffe54d;border:1px solid #ffe100;padding:5px 8px;font:bold 13px Arial,sans-serif;cursor:pointer;}',
      '.okawari-preview-actions button:hover{background:#193b55;}',
      '.okawari-preview-filter{display:inline-flex;gap:4px;align-items:center;border:1px solid rgba(255,225,0,.8);padding:4px 6px;color:#ffe54d;background:#10283b;font:bold 13px Arial,sans-serif;}',
      '.okawari-preview-score{margin:4px 0 10px;background:rgba(31,31,31,.86);border:1px solid rgba(255,255,255,.22);padding:6px 8px;font-size:14px;line-height:1.45;}',
      '.okawari-preview-score summary{cursor:pointer;font-weight:bold;color:#fff;}',
      '.okawari-preview-score-lines{margin-top:6px;}',
      '.okawari-preview-score-lines b{color:#fff;}',
      '.okawari-preview-log{border-top:1px solid rgba(255,255,255,.25);max-height:360px;overflow:auto;background:rgba(9,31,50,.72);}',
      '.okawari-preview-log table{width:100%;border-collapse:collapse;}',
      '.okawari-preview-log th,.okawari-preview-log td{border-bottom:1px solid rgba(255,255,255,.12);padding:5px 7px;text-align:left;vertical-align:top;}',
      '.okawari-preview-log th:first-child,.okawari-preview-log td:first-child{width:58px;white-space:nowrap;}',
      '.okawari-preview-done{margin-left:6px;vertical-align:middle;}',
      '.okawari-preview-log a{color:#ffe100;text-decoration:none;font-weight:bold;}',
      '.okawari-preview-log a:hover{text-decoration:underline;}',
      '.okawari-preview-log th{position:sticky;top:0;background:#10283b;color:#fff;z-index:1;}',
      '.okawari-preview-muted{color:#c6d7e5;}',
      '.okawari-preview-hidden-log{color:rgba(255,255,255,.25);}'
    ].join('');
    document.head.appendChild(style);
  };

  self.openDialog = function () {
    self.loadStoredTargetPortals();
    self.renderDialog();
    self.drawTargetPins();
  };

  self.loadBookmarks = function () {
    self.readSettings();
    self.warnings = [];
    var portals = self.readBookmarkPortals();
    self.bookmarkPortals = portals;
    self.setTargetPortals(portals);
    self.results = [];
    self.selectedResult = -1;
    if (!portals.length) {
      self.message = 'ブックマークのポータルを読み込めませんでした。IITC Bookmark plugin の読み込み状態を確認してください。';
      self.warnings.push('対応している bookmark 保存形式を見つけられませんでした。');
    } else {
      self.message = 'ブックマークから ' + portals.length + ' 件読み込みました。背骨15本を選択してからA/B探索してください。';
    }
    self.renderDialog();
    self.drawTargetPins();
  };

  self.loadStoredTargetPortals = function () {
    try {
      var stored = JSON.parse(window.localStorage.getItem(self.storageKey) || '[]');
      if (!Array.isArray(stored)) return;
      self.bookmarkPortals = stored.map(self.portalFromData).filter(Boolean);
      self.selectedSpine = self.bookmarkPortals.slice(0, self.settings.spineSize);
    } catch (e) {
      self.warnings.push('保存済み対象ポータルを読み込めませんでした。');
    }
  };

  self.saveTargetPortals = function () {
    try {
      window.localStorage.setItem(self.storageKey, JSON.stringify(self.bookmarkPortals.map(function (p) {
        return self.portalToData(p);
      })));
    } catch (e) {
      self.warnings.push('対象ポータルを内部ストレージへ保存できませんでした。');
    }
  };

  self.setTargetPortals = function (portals) {
    self.selectedSpine = portals.slice(0, self.settings.spineSize);
    self.bookmarkPortals = portals.slice();
    self.saveTargetPortals();
  };

  self.addTargetPortals = function (portals) {
    var byGuid = {};
    self.bookmarkPortals.forEach(function (p) { byGuid[p.guid] = true; });
    portals.forEach(function (p) {
      if (!p || byGuid[p.guid]) return;
      byGuid[p.guid] = true;
      self.bookmarkPortals.push(p);
    });
    self.selectedSpine = self.bookmarkPortals.slice(0, self.settings.spineSize);
    self.saveTargetPortals();
  };

  self.handlePortalSelected = function (data) {
    if (!self.isMainDialogOpen()) return;
    var guid = data && (data.guid || data.portalGuid || data.selectedPortalGuid) || window.selectedPortal;
    var portal = self.portalFromMapGuid(guid);
    if (!portal) return;
    if (self.manualAPickEnabled) {
      self.addManualAPortal(portal);
      return;
    }
    if (self.manualBPickEnabled) {
      self.addManualBPortal(portal);
      return;
    }
    if (!self.mapPickEnabled) return;
    self.addTargetPortals([portal]);
    self.results = [];
    self.selectedResult = -1;
    self.targetsOpen = true;
    self.message = 'マップクリックで対象ポータルに追加しました: ' + portal.name;
    self.renderDialog();
    self.drawTargetPins();
  };

  self.isMainDialogOpen = function () {
    var content = document.getElementById('okawari-finder-content');
    if (!content || !document.getElementById('okawari-root')) return false;
    var jq = window.jQuery && window.jQuery(content);
    if (jq && jq.dialog && jq.hasClass('ui-dialog-content')) return jq.dialog('isOpen');
    return true;
  };

  self.portalFromMapGuid = function (guid) {
    if (!guid || !window.portals || !window.portals[guid]) return null;
    var portal = window.portals[guid];
    if (!portal || !portal.getLatLng) return null;
    var ll = portal.getLatLng();
    var data = portal.options && portal.options.data ? portal.options.data : {};
    return self.makePortal(guid, data.title || data.name || guid, ll.lat, ll.lng, data);
  };

  self.clearTargetPortals = function () {
    if (!window.confirm('対象ポータルを一括削除しますか？')) {
      self.message = '対象ポータル一括削除をキャンセルしました。';
      self.renderDialog();
      return;
    }
    self.selectedSpine = [];
    self.bookmarkPortals = [];
    self.results = [];
    self.selectedResult = -1;
    self.saveTargetPortals();
    self.clearMap();
    if (self.targetLayerGroup) self.targetLayerGroup.clearLayers();
    self.message = '対象ポータルを一括削除しました。';
    self.renderDialog();
  };

  self.readBookmarkPortals = function () {
    var byGuid = {};
    var portals = [];

    function add(guid, raw) {
      if (!guid || byGuid[guid]) return;
      var p = self.portalFromBookmark(guid, raw);
      if (!p) return;
      byGuid[guid] = true;
      portals.push(p);
    }

    var bm = window.plugin && window.plugin.bookmarks;
    if (bm) {
      self.walkBookmarkObject(bm.bkmrksObj, add);
      self.walkBookmarkObject(bm.bookmarks, add);
      self.walkBookmarkObject(bm.portals, add);
    }

    try {
      Object.keys(window.localStorage || {}).forEach(function (key) {
        if (key.toLowerCase().indexOf('bookmark') < 0 && key.toLowerCase().indexOf('bkmrk') < 0) return;
        var value = window.localStorage.getItem(key);
        if (!value || value.length > 3000000) return;
        try {
          self.walkBookmarkObject(JSON.parse(value), add);
        } catch (e) {
          // Ignore non-JSON localStorage values.
        }
      });
    } catch (e) {
      self.warnings.push('localStorage のブックマーク候補を読めませんでした。');
    }

    portals.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return portals;
  };

  self.walkBookmarkObject = function (obj, add, seen) {
    if (!obj || typeof obj !== 'object') return;
    seen = seen || [];
    if (seen.indexOf(obj) >= 0) return;
    seen.push(obj);
    if (Array.isArray(obj)) {
      obj.forEach(function (item) { self.walkBookmarkObject(item, add, seen); });
      return;
    }

    var guid = obj.guid || obj.id || obj.portalGuid || obj.portal_guid;
    if (guid && self.hasLatLng(obj)) add(guid, obj);

    Object.keys(obj).forEach(function (key) {
      var value = obj[key];
      if (value && typeof value === 'object') {
        if (self.hasLatLng(value)) add(value.guid || key, value);
        self.walkBookmarkObject(value, add, seen);
      }
    });
  };

  self.hasLatLng = function (obj) {
    return obj && (
      (obj.lat !== undefined && obj.lng !== undefined) ||
      obj.latlng !== undefined ||
      obj.latLng !== undefined ||
      (obj.latE6 !== undefined && obj.lngE6 !== undefined) ||
      (obj._latlng && obj._latlng.lat !== undefined && obj._latlng.lng !== undefined)
    );
  };

  self.portalFromBookmark = function (guid, raw) {
    var lat = raw.lat;
    var lng = raw.lng;
    if (raw.latE6 !== undefined) lat = raw.latE6 / 1000000;
    if (raw.lngE6 !== undefined) lng = raw.lngE6 / 1000000;
    var latlng = raw.latlng || raw.latLng;
    if (typeof latlng === 'string') {
      var parts = latlng.split(',');
      if (parts.length >= 2) {
        lat = parts[0];
        lng = parts[1];
      }
    } else if (latlng && latlng.lat !== undefined && latlng.lng !== undefined) {
      lat = latlng.lat;
      lng = latlng.lng;
    }
    if (raw._latlng) {
      lat = raw._latlng.lat;
      lng = raw._latlng.lng;
    }
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    var name = raw.label || raw.title || raw.name || raw.portalTitle || raw.portalName || guid;
    return self.makePortal(guid, name, lat, lng, raw);
  };

  self.makePortal = function (guid, name, lat, lng, data) {
    data = data || {};
    return {
      guid: guid,
      name: name,
      lat: lat,
      lng: lng,
      team: data.team || data.teamString || data.controllingTeam || '',
      level: data.level || data.lv || '',
      status: data.status || data.health || '',
      x: lng,
      y: lat,
      mx: self.lngToMeters(lng, lat),
      my: self.latToMeters(lat),
      latLng: L.latLng(lat, lng)
    };
  };

  self.getVisiblePortals = function () {
    var bounds = window.map.getBounds();
    var portals = [];
    Object.keys(window.portals || {}).forEach(function (guid) {
      var portal = window.portals[guid];
      if (!portal || !portal.getLatLng) return;
      var ll = portal.getLatLng();
      if (!bounds.contains(ll)) return;
      var data = portal.options && portal.options.data ? portal.options.data : {};
      portals.push(self.makePortal(guid, data.title || data.name || guid, ll.lat, ll.lng, data));
    });
    return portals;
  };

  self.toggleSpine = function (guid) {
    var existing = self.selectedSpine.some(function (p) { return p.guid === guid; });
    if (existing) {
      self.selectedSpine = self.selectedSpine.filter(function (p) { return p.guid !== guid; });
    } else {
      if (self.selectedSpine.length >= self.settings.spineSize) {
        self.message = '背骨は15本固定です。追加する場合は先にどれかを削除してください。';
        self.renderDialog();
        return;
      }
      var p = self.bookmarkPortals.filter(function (portal) { return portal.guid === guid; })[0];
      if (p) self.selectedSpine.push(p);
    }
    self.results = [];
    self.selectedResult = -1;
    self.message = '背骨選択: ' + self.selectedSpine.length + ' / ' + self.settings.spineSize;
    self.renderDialog();
  };

  self.removeSelectedSpine = function (guid) {
    self.selectedSpine = self.selectedSpine.filter(function (p) { return p.guid !== guid; });
    self.bookmarkPortals = self.bookmarkPortals.filter(function (p) { return p.guid !== guid; });
    if (self.selectedSpine.length < self.settings.spineSize) {
      self.selectedSpine = self.bookmarkPortals.slice(0, self.settings.spineSize);
    }
    self.results = [];
    self.selectedResult = -1;
    self.saveTargetPortals();
    self.message = '対象ポータルを削除しました。計画対象: ' + self.selectedSpine.length + ' / ' + self.settings.spineSize;
    self.renderDialog();
    self.drawTargetPins();
  };

  self.findAB = function () {
    self.readSettings();
    self.warnings = [];
    self.results = [];
    self.selectedResult = -1;
    self.manualAPickEnabled = false;
    self.manualBPickEnabled = false;
    self.clearMap();

    if (self.selectedSpine.length !== self.settings.spineSize) {
      self.message = '背骨は15本ちょうど選択してください。現在 ' + self.selectedSpine.length + ' 本です。';
      self.renderDialog();
      return;
    }

    var visible = self.getVisiblePortals();
    var spine = self.orderSpine(self.selectedSpine);
    var spineIds = {};
    spine.forEach(function (p) { spineIds[p.guid] = true; });
    var candidates = visible.filter(function (p) { return !spineIds[p.guid]; });

    var evaluated = [];
    var basePool = self.selectBasePool(candidates, spine);
    var clusters = self.findBClusters(basePool, spine);
    for (var c = 0; c < clusters.length; c++) {
      var cluster = clusters[c];
      var bestA = self.findAForBCluster(cluster.Bs, basePool, spine);
      if (!bestA) continue;
      evaluated.push(self.makeResult(spine, bestA, cluster.Bs, cluster));
    }

    evaluated.sort(self.compareResults);
    self.results = evaluated.slice(0, 50);
    self.selectedResult = self.results.length ? 0 : -1;
    self.message = self.results.length
      ? 'B密度優先探索が完了しました。Bクラスタ ' + clusters.length + ' 件から候補 ' + self.results.length + ' 件。'
      : 'A/B候補が見つかりませんでした。画面内ポータルの読み込み範囲を広げるか、背骨選択を見直してください。';
    self.renderDialog();
    if (self.selectedResult >= 0 && self.settings.drawOnMap) self.drawResult(self.results[self.selectedResult]);
  };

  self.selectBasePool = function (portals, spine) {
    var start = spine[0];
    var end = spine[spine.length - 1];
    return portals.map(function (p) {
      var density = portals.reduce(function (count, other) {
        return count + (p.guid !== other.guid && self.distMeters(p, other) <= self.settings.bClusterRadius ? 1 : 0);
      }, 0);
      return {
        portal: p,
        quality: self.baseQuality(p, spine) + Math.min(60, density * 10),
        distance: self.pointLineDistanceMeters(p, start, end)
      };
    }).filter(function (item) {
      return item.distance >= 20;
    }).sort(function (a, b) {
      return b.quality - a.quality;
    }).slice(0, self.settings.maxBaseCandidates).map(function (item) {
      return item.portal;
    });
  };

  self.findBClusters = function (basePool, spine) {
    var validBs = basePool.filter(function (p) {
      return self.baseCreatesValidFan(p, spine);
    });
    var seen = {};
    var clusters = [];

    validBs.forEach(function (center) {
      var members = validBs.filter(function (p) {
        return self.distMeters(center, p) <= self.settings.bClusterRadius;
      }).sort(function (a, b) {
        return self.distMeters(center, a) - self.distMeters(center, b);
      }).slice(0, self.settings.repeatBases);

      if (!members.length) return;
      var key = members.map(function (p) { return p.guid; }).sort().join('|');
      if (seen[key]) return;
      seen[key] = true;

      var density = self.okawariEaseScore(members);
      clusters.push({
        center: center,
        Bs: members,
        densityScore: density.score,
        avgDistance: density.avgDistance
      });
    });

    clusters.sort(function (a, b) {
      return (b.Bs.length - a.Bs.length) ||
        (b.densityScore - a.densityScore) ||
        (a.avgDistance - b.avgDistance);
    });
    return clusters.slice(0, 80);
  };

  self.findAForBCluster = function (basesB, basePool, spine) {
    var best = null;
    for (var i = 0; i < basePool.length; i++) {
      var baseA = basePool[i];
      if (basesB.some(function (b) { return b.guid === baseA.guid; })) continue;
      if (!self.baseCreatesValidFan(baseA, spine)) continue;
      if (!self.validAForAllBs(baseA, basesB, spine)) continue;

      var score = self.aQualityForCluster(baseA, basesB, spine);
      if (!best || score > best.score) best = { portal: baseA, score: score };
    }
    return best ? best.portal : null;
  };

  self.validAForAllBs = function (baseA, basesB, spine) {
    var start = spine[0];
    var end = spine[spine.length - 1];
    for (var i = 0; i < basesB.length; i++) {
      if (self.sideMeters(start, end, baseA) * self.sideMeters(start, end, basesB[i]) >= 0) return false;
      if (!self.validABTriangle(baseA, basesB[i], spine)) return false;
    }
    return true;
  };

  self.validABTriangle = function (baseA, baseB, spine) {
    if (self.linkHitsOtherSpinePortal(baseA, baseB, spine)) return false;
    var apex = self.spineApexForBase(baseA, baseB, spine);
    for (var i = 0; i < spine.length; i++) {
      if (!self.pointInTriangleMeters(spine[i], baseA, baseB, apex, self.settings.overlapMeters)) return false;
    }
    return true;
  };

  self.resultAs = function (result) {
    if (!result) return [];
    if (result.As && result.As.length) return result.As;
    return result.A ? [result.A] : [];
  };

  self.aLabel = function (index, count) {
    return count > 1 ? 'A' + (index + 1) : 'A';
  };

  self.originalACount = function (result, basesA) {
    return typeof result.originalACount === 'number' ? result.originalACount : basesA.length;
  };

  self.makeResult = function (spine, baseA, basesB, cluster) {
    var basesA = Array.isArray(baseA) ? baseA.slice() : (baseA ? [baseA] : []);
    var primaryA = basesA[0];
    var oriented = primaryA ? self.orientSpineForBase(primaryA, basesB[0], spine) : self.orderSpine(spine);
    var plan = self.buildPlan(oriented, basesA, basesB);
    var fields = oriented.length * basesB.length * basesA.length;
    var scores = self.scorePlan(plan, fields);
    var shape = self.shapeScoreForAs(oriented, basesA, basesB);
    var okawari = self.okawariEaseScore(basesB);
    return {
      spine: oriented,
      A: primaryA,
      As: basesA,
      Bs: basesB,
      plan: plan,
      fields: fields,
      links: plan.length,
      scores: scores,
      teamScore: scores.team,
      shapeScore: shape.total,
      straightness: shape.straightness,
      okawariScore: okawari.score,
      okawariAvgDistance: okawari.avgDistance,
      clusterCenter: cluster ? cluster.center : basesB[0],
      clusterDensityScore: cluster ? cluster.densityScore : okawari.score,
      aCount: basesA.length,
      originalACount: basesA.length,
      bCount: basesB.length,
      originalBCount: basesB.length
    };
  };

  self.rebuildResultWithAs = function (result, basesA, originalACount) {
    var rebuilt = self.makeResult(result.spine, basesA, result.Bs, {
      center: result.clusterCenter || result.Bs[0],
      densityScore: result.clusterDensityScore || 0
    });
    rebuilt.originalACount = Math.min(originalACount, basesA.length);
    rebuilt.manualACount = Math.max(0, basesA.length - originalACount);
    rebuilt.originalBCount = result.originalBCount || result.Bs.length;
    rebuilt.manualBCount = Math.max(0, result.Bs.length - rebuilt.originalBCount);
    return rebuilt;
  };

  self.rebuildResultWithBs = function (result, basesB, originalBCount) {
    var rebuilt = self.makeResult(result.spine, self.resultAs(result), basesB, {
      center: result.clusterCenter || basesB[0],
      densityScore: result.clusterDensityScore || 0
    });
    rebuilt.originalACount = self.originalACount(result, self.resultAs(result));
    rebuilt.manualACount = Math.max(0, self.resultAs(result).length - rebuilt.originalACount);
    rebuilt.originalBCount = originalBCount;
    rebuilt.manualBCount = Math.max(0, basesB.length - originalBCount);
    return rebuilt;
  };

  self.addManualAPortal = function (portal) {
    self.readSettings();
    var result = self.results[self.selectedResult];
    if (!result) {
      self.message = 'A手動変更・追加する計画を先に選択してください。';
      self.renderDialog();
      return;
    }
    var check = self.validateManualAPortal(result, portal);
    if (!check.ok) {
      self.message = 'A手動変更・追加NG: ' + check.reasons.join(' / ');
      self.renderDialog();
      if (self.settings.drawOnMap) self.drawResult(result);
      return;
    }
    var basesA = self.resultAs(result);
    var originalACount = self.originalACount(result, basesA);
    var rebuilt = self.rebuildResultWithAs(result, basesA.concat([portal]), originalACount);
    self.results[self.selectedResult] = rebuilt;
    self.message = 'Aを手動追加しました: ' + portal.name + '（現在 ' + rebuilt.As.length + '件）';
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(rebuilt);
  };

  self.validateManualAPortal = function (result, portal) {
    var reasons = [];
    var basesA = self.resultAs(result);
    if (basesA.some(function (p) { return p.guid === portal.guid; })) reasons.push('既にAに含まれています');
    if (result.spine.some(function (p) { return p.guid === portal.guid; })) reasons.push('背骨ポータルと同じです');
    if (result.Bs.some(function (p) { return p.guid === portal.guid; })) reasons.push('基点Bと同じポータルです');
    if (reasons.length) return { ok: false, reasons: reasons };

    var spine = self.orderSpine(result.spine);
    if (!self.baseCreatesValidFan(portal, spine)) {
      reasons.push('Aから背骨15本へのリンクが被り判定にかかります');
    }
    if (!self.validAForAllBs(portal, result.Bs, spine)) {
      reasons.push('すべてのBとのA-B-背骨構造が成立しません');
    }
    return { ok: !reasons.length, reasons: reasons };
  };

  self.addManualBPortal = function (portal) {
    self.readSettings();
    var result = self.results[self.selectedResult];
    if (!result) {
      self.message = 'B手動追加する計画を先に選択してください。';
      self.renderDialog();
      return;
    }
    var check = self.validateManualBPortal(result, portal);
    if (!check.ok) {
      self.message = 'B手動追加NG: ' + check.reasons.join(' / ');
      self.renderDialog();
      if (self.settings.drawOnMap) self.drawResult(result);
      return;
    }
    var originalBCount = result.originalBCount || result.Bs.length;
    var basesB = result.Bs.concat([portal]);
    var rebuilt = self.rebuildResultWithBs(result, basesB, originalBCount);
    self.results[self.selectedResult] = rebuilt;
    self.message = 'Bを手動追加しました: ' + portal.name + '（現在 ' + rebuilt.Bs.length + '件）';
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(rebuilt);
  };

  self.validateManualBPortal = function (result, portal) {
    var reasons = [];
    var basesA = self.resultAs(result);
    if (basesA.some(function (p) { return p.guid === portal.guid; })) reasons.push('基点Aと同じポータルです');
    if (result.spine.some(function (p) { return p.guid === portal.guid; })) reasons.push('背骨ポータルと同じです');
    if (result.Bs.some(function (p) { return p.guid === portal.guid; })) reasons.push('既にBに含まれています');
    if (reasons.length) return { ok: false, reasons: reasons };

    var spine = self.orderSpine(result.spine);
    var start = spine[0];
    var end = spine[spine.length - 1];
    if (!self.baseCreatesValidFan(portal, spine)) {
      reasons.push('Bから背骨15本へのリンクが被り判定にかかります');
    }
    for (var i = 0; i < basesA.length; i++) {
      if (self.sideMeters(start, end, basesA[i]) * self.sideMeters(start, end, portal) >= 0) {
        reasons.push(self.aLabel(i, basesA.length) + 'と背骨列の反対側にありません');
      }
      if (!self.validABTriangle(basesA[i], portal, spine)) {
        reasons.push(self.aLabel(i, basesA.length) + '-Bと背骨15本で三角形が成立しません');
      }
    }
    return { ok: !reasons.length, reasons: reasons };
  };

  self.removeLastManualA = function () {
    var result = self.results[self.selectedResult];
    if (!result) return;
    var basesA = self.resultAs(result);
    var originalACount = self.originalACount(result, basesA);
    if (!basesA.length) {
      self.message = '削除できるAはありません。';
      self.renderDialog();
      return;
    }
    var removed = basesA[basesA.length - 1];
    var removingAutoA = basesA.length <= originalACount;
    if (removingAutoA && !window.confirm('自動選択されたAを削除しますか？')) {
      self.message = '自動選択Aの削除をキャンセルしました。';
      self.renderDialog();
      return;
    }
    var nextAs = basesA.slice(0, -1);
    var nextOriginalACount = removingAutoA ? Math.max(0, originalACount - 1) : originalACount;
    var rebuilt = self.rebuildResultWithAs(result, nextAs, nextOriginalACount);
    self.results[self.selectedResult] = rebuilt;
    self.message = (removingAutoA ? '自動選択Aを削除しました: ' : '最後の手動追加Aを削除しました: ') + removed.name;
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(rebuilt);
  };

  self.clearManualAs = function () {
    var result = self.results[self.selectedResult];
    if (!result) return;
    var basesA = self.resultAs(result);
    var originalACount = self.originalACount(result, basesA);
    if (basesA.length <= originalACount) {
      self.message = 'クリアできる手動追加Aはありません。';
      self.renderDialog();
      return;
    }
    var rebuilt = self.rebuildResultWithAs(result, basesA.slice(0, originalACount), originalACount);
    self.results[self.selectedResult] = rebuilt;
    self.message = '手動追加Aをクリアしました。';
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(rebuilt);
  };

  self.removeLastManualB = function () {
    var result = self.results[self.selectedResult];
    if (!result) return;
    var originalBCount = result.originalBCount || result.Bs.length;
    if (result.Bs.length <= originalBCount) {
      self.message = '削除できる手動追加Bはありません。';
      self.renderDialog();
      return;
    }
    var removed = result.Bs[result.Bs.length - 1];
    var rebuilt = self.rebuildResultWithBs(result, result.Bs.slice(0, -1), originalBCount);
    self.results[self.selectedResult] = rebuilt;
    self.message = '最後の手動追加Bを削除しました: ' + removed.name;
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(rebuilt);
  };

  self.clearManualBs = function () {
    var result = self.results[self.selectedResult];
    if (!result) return;
    var originalBCount = result.originalBCount || result.Bs.length;
    if (result.Bs.length <= originalBCount) {
      self.message = 'クリアできる手動追加Bはありません。';
      self.renderDialog();
      return;
    }
    var rebuilt = self.rebuildResultWithBs(result, result.Bs.slice(0, originalBCount), originalBCount);
    self.results[self.selectedResult] = rebuilt;
    self.message = '手動追加Bをクリアしました。';
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(rebuilt);
  };

  self.buildPlan = function (spine, basesA, basesB) {
    var links = [];
    basesA = Array.isArray(basesA) ? basesA : [basesA];
    function add(from, to, agent, label) {
      links.push({ from: from, to: to, agent: agent, label: label || '' });
    }

    for (var i = 0; i < spine.length - 1; i++) add(spine[i], spine[i + 1], 'C', '背骨リンク');
    for (var ai = 0; ai < basesA.length; ai++) {
      for (var a = 0; a < spine.length; a++) add(spine[a], basesA[ai], self.agentForASpineLink(a), '背骨→基点' + self.aLabel(ai, basesA.length));
    }
    for (var b = 0; b < basesB.length; b++) {
      for (var ab = 0; ab < basesA.length; ab++) add(basesB[b], basesA[ab], 'C', 'B-A底辺リンク');
      for (var j = 0; j < spine.length; j++) add(basesB[b], spine[j], self.agentForBSpineLink(j), '基点B-' + (b + 1) + '→背骨');
    }
    return links;
  };

  self.agentForASpineLink = function (index) {
    return index % 2 === 0 ? 'B' : 'A';
  };

  self.agentForBSpineLink = function (index) {
    return index % 2 === 0 ? 'A' : 'B';
  };

  self.scorePlan = function (plan, fields) {
    var linkPoints = { A: 0, B: 0, C: 0 };
    plan.forEach(function (link) { linkPoints[link.agent] = (linkPoints[link.agent] || 0) + 2; });
    return {
      A: linkPoints.A + fields * 30,
      B: linkPoints.B + fields * 30,
      C: linkPoints.C + fields * 30,
      team: fields * 90 + plan.length * 2
    };
  };

  self.compareResults = function (a, b) {
    return (b.teamScore - a.teamScore) ||
      (b.bCount - a.bCount) ||
      (b.shapeScore - a.shapeScore) ||
      (b.okawariScore - a.okawariScore) ||
      (b.straightness - a.straightness);
  };

  self.getSelectedResultForSave = function () {
    var result = self.results[self.selectedResult];
    if (!result) {
      self.message = '保存する候補を選択してください。';
      self.renderDialog();
      return null;
    }
    return result;
  };

  self.downloadJson = function (data, prefix) {
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var date = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = prefix + '-' + date + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  self.downloadText = function (text, prefix, extension, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var date = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = prefix + '-' + date + '.' + extension;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  self.saveBookmarksResult = function () {
    var result = self.getSelectedResultForSave();
    if (!result) return;
    self.downloadJson(self.resultToBookmarkExportData(result), 'okawari-bookmarks');
    self.message = '背骨、A、Bのポータルをブックマーク用JSONで保存しました。';
    self.renderDialog();
  };

  self.saveDrawResult = function () {
    var result = self.getSelectedResultForSave();
    if (!result) return;
    self.downloadJson(self.resultToDrawExportData(result), 'okawari-draw-data');
    self.message = '背骨とA群/Bからのリンク線をドローデータJSONで保存しました。';
    self.renderDialog();
  };

  self.saveCustomResult = function () {
    var result = self.getSelectedResultForSave();
    if (!result) return;
    self.readSettings();
    self.downloadJson(self.resultToExportData(result), 'okawari-finder');
    self.message = '結果を独自形式JSONで保存しました。';
    self.renderDialog();
  };

  self.resultToBookmarkExportData = function (result) {
    var bkmrk = {};
    self.resultBookmarkPortals(result).forEach(function (item, index) {
      bkmrk['id' + Date.now() + index] = {
        guid: item.portal.guid,
        latlng: item.portal.lat + ',' + item.portal.lng,
        label: item.portal.name
      };
    });
    return {
      maps: {
        idOthers: {
          label: 'Others',
          state: 1,
          bkmrk: {}
        }
      },
      portals: {
        idOthers: {
          label: 'Others',
          state: 1,
          bkmrk: bkmrk
        }
      }
    };
  };

  self.resultBookmarkPortals = function (result) {
    var basesA = self.resultAs(result);
    return result.spine.map(function (p, index) {
      return { label: self.spineLabel(index), portal: p };
    }).concat(basesA.map(function (p, index) {
      return { label: self.aLabel(index, basesA.length), portal: p };
    })).concat(result.Bs.map(function (p, index) {
      return { label: 'B' + (index + 1), portal: p };
    }));
  };

  self.resultToDrawExportData = function (result) {
    var drawTools = [];
    drawTools.push({
      type: 'polyline',
      latLngs: result.spine.map(self.portalToLatLngData),
      color: self.colors.spine
    });
    result.plan.forEach(function (link) {
      drawTools.push({
        type: 'polyline',
        latLngs: [self.portalToLatLngData(link.from), self.portalToLatLngData(link.to)],
        color: self.colors[link.agent] || self.colors.base
      });
    });
    return drawTools;
  };

  self.resultToExportData = function (result) {
    var basesA = self.resultAs(result);
    return {
      format: 'okawari-finder-result',
      formatVersion: '0.1',
      plugin: self.title,
      pluginVersion: '0.4.6',
      generatedAt: new Date().toISOString(),
      settings: {
        spineSize: self.settings.spineSize,
        repeatBases: self.settings.repeatBases,
        bClusterRadius: self.settings.bClusterRadius,
        overlapMeters: self.settings.overlapMeters,
        agents: self.agentNames()
      },
      bookmarks: {
        spine: result.spine.map(function (p, index) { return self.portalToData(p, self.spineLabel(index)); }),
        A: basesA[0] ? self.portalToData(basesA[0], 'A') : null,
        As: basesA.map(function (p, index) { return self.portalToData(p, self.aLabel(index, basesA.length)); }),
        Bs: result.Bs.map(function (p, index) { return self.portalToData(p, 'B' + (index + 1)); })
      },
      result: {
        fields: result.fields,
        links: result.links,
        scores: result.scores,
        teamScore: result.teamScore,
        shapeScore: result.shapeScore,
        straightness: result.straightness,
        okawariScore: result.okawariScore,
        okawariAvgDistance: result.okawariAvgDistance,
        aCount: basesA.length,
        originalACount: self.originalACount(result, basesA),
        manualACount: Math.max(0, basesA.length - self.originalACount(result, basesA)),
        bCount: result.bCount,
        originalBCount: result.originalBCount || result.bCount,
        manualBCount: Math.max(0, result.Bs.length - (result.originalBCount || result.Bs.length))
      },
      drawData: {
        markers: self.resultMarkers(result),
        links: result.plan.map(function (link) {
          return {
            fromGuid: link.from.guid,
            toGuid: link.to.guid,
            fromName: link.from.name,
            toName: link.to.name,
            agent: link.agent,
            agentName: self.agentName(link.agent),
            label: link.label,
            from: self.portalToData(link.from),
            to: self.portalToData(link.to)
          };
        })
      }
    };
  };

  self.portalToData = function (portal, role) {
    return {
      guid: portal.guid,
      name: portal.name,
      lat: portal.lat,
      lng: portal.lng,
      role: role || '',
      team: portal.team || '',
      level: portal.level || '',
      status: portal.status || ''
    };
  };

  self.portalToLatLngData = function (portal) {
    return {
      lat: portal.lat,
      lng: portal.lng
    };
  };

  self.resultMarkers = function (result) {
    var basesA = self.resultAs(result);
    return basesA.map(function (p, i) {
      var label = self.aLabel(i, basesA.length);
      return { label: label, portal: self.portalToData(p, label) };
    })
      .concat(result.Bs.map(function (p, i) { return { label: 'B' + (i + 1), portal: self.portalToData(p, 'B' + (i + 1)) }; }))
      .concat(result.spine.map(function (p, i) { return { label: self.spineLabel(i), portal: self.portalToData(p, self.spineLabel(i)) }; }));
  };

  self.loadResultFile = function (file) {
    if (!file) return;
    if ((self.results.length || self.selectedSpine.length || self.bookmarkPortals.length) &&
        !window.confirm('既存の結果・背骨選択を消して読み込みます。よろしいですか？')) {
      self.message = '結果読込をキャンセルしました。';
      self.renderDialog();
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      try {
        self.importResultData(JSON.parse(String(reader.result || '')));
      } catch (e) {
        self.message = '結果JSONを読み込めませんでした。';
        self.warnings = ['JSONの形式を確認してください。'];
        self.renderDialog();
      }
    };
    reader.readAsText(file);
  };

  self.importResultData = function (data) {
    if (!data || data.format !== 'okawari-finder-result' || data.formatVersion !== '0.1') {
      self.message = '対応していない結果ファイルです。';
      self.warnings = ['format は okawari-finder-result、formatVersion は 0.1 が必要です。'];
      self.renderDialog();
      return;
    }

    var spine = (data.bookmarks && data.bookmarks.spine || []).map(self.portalFromData);
    var basesA = (data.bookmarks && data.bookmarks.As || []).map(self.portalFromData).filter(Boolean);
    var baseA = self.portalFromData(data.bookmarks && data.bookmarks.A);
    if (!basesA.length && baseA) basesA = [baseA];
    var basesB = (data.bookmarks && data.bookmarks.Bs || []).map(self.portalFromData).filter(Boolean);
    if (spine.length !== self.settings.spineSize || !basesB.length) {
      self.message = '結果ファイルに必要な背骨/A/Bデータがありません。';
      self.warnings = ['背骨15本、基点Bが必要です。Aが空の計画は読み込み後に手動追加できます。'];
      self.renderDialog();
      return;
    }

    if (data.settings) {
      self.settings.repeatBases = data.settings.repeatBases || self.settings.repeatBases;
      self.settings.bClusterRadius = data.settings.bClusterRadius || self.settings.bClusterRadius;
      self.settings.overlapMeters = data.settings.overlapMeters || self.settings.overlapMeters;
      if (data.settings.agents) {
        self.settings.agents.A = data.settings.agents.A || self.settings.agents.A;
        self.settings.agents.B = data.settings.agents.B || self.settings.agents.B;
        self.settings.agents.C = data.settings.agents.C || self.settings.agents.C;
      }
    }

    var result = self.makeResult(spine, basesA, basesB, null);
    if (data.result) {
      result.fields = data.result.fields || result.fields;
      result.links = data.result.links || result.links;
      result.scores = data.result.scores || result.scores;
      result.teamScore = data.result.teamScore || result.teamScore;
      result.shapeScore = data.result.shapeScore || result.shapeScore;
      result.straightness = data.result.straightness || result.straightness;
      result.okawariScore = data.result.okawariScore || result.okawariScore;
      result.okawariAvgDistance = data.result.okawariAvgDistance || result.okawariAvgDistance;
      result.aCount = data.result.aCount || result.aCount;
      result.originalACount = typeof data.result.originalACount === 'number' ? data.result.originalACount : result.aCount;
      result.manualACount = data.result.manualACount || Math.max(0, result.As.length - result.originalACount);
      result.bCount = data.result.bCount || result.bCount;
      result.originalBCount = data.result.originalBCount || result.bCount;
      result.manualBCount = data.result.manualBCount || Math.max(0, result.Bs.length - result.originalBCount);
    }
    result.drawData = data.drawData || null;

    self.bookmarkPortals = spine.slice();
    self.selectedSpine = spine.slice();
    self.saveTargetPortals();
    self.results = [result];
    self.selectedResult = 0;
    self.manualAPickEnabled = false;
    self.manualBPickEnabled = false;
    self.warnings = [];
    self.message = '結果JSONを読み込みました。';
    self.renderDialog();
    if (self.settings.drawOnMap) self.drawResult(result);
  };

  self.portalFromData = function (data) {
    if (!data) return null;
    var lat = parseFloat(data.lat);
    var lng = parseFloat(data.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return self.makePortal(data.guid || data.name, data.name || data.guid, lat, lng, data);
  };

  self.loadUiSettings = function () {
    try {
      var data = JSON.parse(window.localStorage.getItem(self.uiStorageKey) || '{}');
      if (!data || typeof data !== 'object') return;
      if (self.validDialogPosition(data.mainPosition)) self.settings.ui.mainPosition = data.mainPosition;
      if (self.validDialogPosition(data.previewPosition)) self.settings.ui.previewPosition = data.previewPosition;
    } catch (e) {
      // Keep defaults when storage is unavailable.
    }
  };

  self.saveUiSettings = function () {
    try {
      window.localStorage.setItem(self.uiStorageKey, JSON.stringify({
        mainPosition: self.settings.ui.mainPosition,
        previewPosition: self.settings.ui.previewPosition
      }));
    } catch (e) {
      // Settings still work for the current session.
    }
  };

  self.validDialogPosition = function (position) {
    return position === 'left' || position === 'center' || position === 'right';
  };

  self.applyDialogPosition = function (contentId, position, width, sideWidth) {
    var content = document.getElementById(contentId);
    if (!content || !window.jQuery) return;
    var jqContent = window.jQuery(content);
    var jqDialog = jqContent.closest('.ui-dialog');
    if (!jqDialog.length) return;
    var dialog = jqDialog[0];
    jqDialog.removeClass('okawari-side-dialog okawari-dialog-left okawari-dialog-right');
    dialog.style.position = '';
    dialog.style.left = '';
    dialog.style.right = '';
    dialog.style.top = '';
    dialog.style.bottom = '';
    dialog.style.margin = '';
    dialog.style.width = '';
    dialog.style.maxWidth = '';
    content.style.maxHeight = '';
    content.style.overflow = '';

    if (position === 'center') {
      if (jqContent.dialog && jqContent.hasClass('ui-dialog-content')) {
        jqContent.dialog('option', 'width', width);
        jqContent.dialog('option', 'position', { my: 'center', at: 'center', of: window });
      }
      return;
    }

    jqDialog.addClass('okawari-side-dialog ' + (position === 'left' ? 'okawari-dialog-left' : 'okawari-dialog-right'));
    dialog.style.width = sideWidth;
    dialog.style.maxWidth = 'calc(100vw - 16px)';
    content.style.maxHeight = 'calc(100vh - 62px)';
    content.style.overflow = 'auto';
  };

  self.renderDialog = function () {
    var html = self.buildHtml();
    var existing = document.getElementById('okawari-finder-content');
    if (existing) {
      existing.innerHTML = html;
      var jqExisting = window.jQuery(existing);
      if (jqExisting.dialog && jqExisting.hasClass('ui-dialog-content')) jqExisting.dialog('open');
      self.applyDialogPosition('okawari-finder-content', self.settings.ui.mainPosition, 1100, 'min(760px, 52vw)');
      self.bindEvents();
      return;
    }

    if (typeof window.dialog === 'function') {
      window.dialog({
        id: 'okawari-finder-dialog',
        title: self.title,
        html: '<div id="okawari-finder-content">' + html + '</div>',
        width: 1100
      });
    } else {
      var div = document.createElement('div');
      div.id = 'okawari-finder-content';
      div.innerHTML = html;
      document.body.appendChild(div);
      window.jQuery(div).dialog({ title: self.title, width: 1100 });
    }
    self.applyDialogPosition('okawari-finder-content', self.settings.ui.mainPosition, 1100, 'min(760px, 52vw)');
    self.bindEvents();
  };

  self.renderOutputDialog = function () {
    var result = self.getSelectedResultForSave();
    if (!result) return;
    var html = self.buildOutputHtml(result);
    var existing = document.getElementById('okawari-output-content');
    if (existing) {
      existing.innerHTML = html;
      var jqExisting = window.jQuery(existing);
      if (jqExisting.dialog && jqExisting.hasClass('ui-dialog-content')) jqExisting.dialog('open');
      self.bindOutputEvents();
      return;
    }

    if (typeof window.dialog === 'function') {
      window.dialog({
        id: 'okawari-output-dialog',
        title: self.title + ' 出力',
        html: '<div id="okawari-output-content">' + html + '</div>',
        width: 900
      });
    } else {
      var div = document.createElement('div');
      div.id = 'okawari-output-content';
      div.innerHTML = html;
      document.body.appendChild(div);
      window.jQuery(div).dialog({ title: self.title + ' 出力', width: 900 });
    }
    self.bindOutputEvents();
  };

  self.getSelectedResultForPreview = function () {
    var result = self.results[self.selectedResult];
    if (!result) {
      self.message = 'まだ計画がありません。先に計画生成してください。';
      self.renderDialog();
      return null;
    }
    return result;
  };

  self.loadPreviewState = function () {
    try {
      var data = JSON.parse(window.localStorage.getItem(self.previewStorageKey) || '{}');
      if (data && data.agents) {
        self.previewState.agents.A = data.agents.A !== false;
        self.previewState.agents.B = data.agents.B !== false;
        self.previewState.agents.C = data.agents.C !== false;
      }
      self.previewState.done = data && data.done && typeof data.done === 'object' ? data.done : {};
    } catch (e) {
      self.previewState.done = {};
    }
  };

  self.savePreviewState = function () {
    try {
      window.localStorage.setItem(self.previewStorageKey, JSON.stringify({
        agents: self.previewState.agents,
        done: self.previewState.done || {}
      }));
    } catch (e) {
      // Ignore storage failures; preview still works for the current dialog.
    }
  };

  self.renderPreviewDialog = function () {
    var result = self.getSelectedResultForPreview();
    if (!result) return;
    self.previewState.step = Math.max(0, Math.min(self.previewState.step || 0, self.previewStepCount(result) - 1));
    var html = self.buildPreviewHtml(result);
    var existing = document.getElementById('okawari-preview-content');
    if (existing) {
      existing.innerHTML = html;
      var jqExisting = window.jQuery(existing);
      if (jqExisting.dialog && jqExisting.hasClass('ui-dialog-content')) jqExisting.dialog('open');
      self.bindPreviewEvents();
      self.applyDialogPosition('okawari-preview-content', self.settings.ui.previewPosition, 760, 'min(760px, 46vw)');
      self.drawPreviewStep(result);
      return;
    }

    if (typeof window.dialog === 'function') {
      window.dialog({
        id: 'okawari-preview-dialog',
        title: 'Okawari CF Plan Preview',
        html: '<div id="okawari-preview-content">' + html + '</div>',
        width: 760
      });
    } else {
      var div = document.createElement('div');
      div.id = 'okawari-preview-content';
      div.innerHTML = html;
      document.body.appendChild(div);
      window.jQuery(div).dialog({ title: 'Okawari CF Plan Preview', width: 760 });
    }
    self.bindPreviewEvents();
    self.applyDialogPosition('okawari-preview-content', self.settings.ui.previewPosition, 760, 'min(760px, 46vw)');
    self.drawPreviewStep(result);
  };

  self.previewStepCount = function (result) {
    return 2 + (result && result.Bs ? result.Bs.length : 0);
  };

  self.buildPreviewHtml = function (result) {
    var step = Math.max(0, Math.min(self.previewState.step || 0, self.previewStepCount(result) - 1));
    var model = self.previewStepModel(result, step);
    var logs = model.logs.map(function (row, i) {
      var visible = self.previewLogVisible(row);
      var key = self.previewDoneKey(result, row);
      var checked = self.previewState.done && self.previewState.done[key] ? 'checked' : '';
      return '<tr><td>' + (i + 1) + '<input class="okawari-preview-done" type="checkbox" data-preview-done="' + self.escape(key) + '" ' + checked + '></td>' +
        '<td class="' + (visible ? '' : 'okawari-preview-hidden-log') + '">' + (visible ? self.previewLogHtml(row) : '') + '</td></tr>';
    }).join('');
    return [
      '<div class="okawari-preview-root">',
      '<div class="okawari-preview-summary">',
      '基点A: ' + self.resultAs(result).length + '個 / おかわりポータル: ' + result.Bs.length + '個 / 背骨: ' + result.spine.length + '本 / ',
      'A鍵目安: ' + self.requiredAKeys(result) + '本以上 / ',
      'プレビュー: ' + model.name + ' / ' + (step + 1) + ' of ' + self.previewStepCount(result),
      '</div>',
      '<div class="okawari-preview-step">' + self.escape(model.title) + '</div>',
      '<div class="okawari-preview-muted">' + self.escape(model.note) + '</div>',
      '<div class="okawari-preview-actions">',
      '<button type="button" data-preview-action="first">最初へ</button>',
      '<button type="button" data-preview-action="prev">戻る</button>',
      '<button type="button" data-preview-action="next">次へ</button>',
      '<button type="button" data-preview-action="last">最後へ</button>',
      '<button type="button" data-preview-action="clear">描画クリア</button>',
      self.previewAgentCheckboxHtml('A'),
      self.previewAgentCheckboxHtml('B'),
      self.previewAgentCheckboxHtml('C'),
      '</div>',
      self.previewScoreHtml(result),
      '<div class="okawari-preview-log">',
      '<table><thead><tr><th>#</th><th>Log</th></tr></thead><tbody>' + logs + '</tbody></table>',
      '</div>',
      '</div>'
    ].join('');
  };

  self.previewAgentCheckboxHtml = function (agent) {
    var checked = self.previewState.agents[agent] !== false ? 'checked' : '';
    return '<label class="okawari-preview-filter"><input type="checkbox" data-preview-agent="' + agent + '" ' + checked + '>担当' + agent + '</label>';
  };

  self.previewScoreHtml = function (result) {
    return [
      '<details class="okawari-preview-score">',
      '<summary>想定スコア</summary>',
      '<div class="okawari-preview-score-lines">',
      '<div>A: ' + self.escape(result.scores.A) + '点　B: ' + self.escape(result.scores.B) + '点　C: ' + self.escape(result.scores.C) + '点</div>',
      '<div><b>Team: ' + self.escape(result.scores.team) + '点</b></div>',
      '<div>Fields: ' + self.escape(result.fields) + '枚　Links: ' + self.escape(result.links) + '本</div>',
      '<div>基点A: ' + self.escape(self.resultAs(result).length) + '個</div>',
      '<div>おかわりB: ' + self.escape(result.Bs.length) + '本　おかわりしやすさ: ' + self.escape(result.okawariScore) + '</div>',
      '<div>B間平均距離: ' + self.escape(Math.round(result.okawariAvgDistance || 0)) + 'm　B密度半径: ' + self.escape(self.settings.bClusterRadius) + 'm</div>',
      '</div>',
      '</details>'
    ].join('');
  };

  self.previewLogVisible = function (row) {
    return !row.agent || self.previewState.agents[row.agent] !== false;
  };

  self.previewLogHtml = function (row) {
    return row.html || self.escape(row.text);
  };

  self.previewLog = function (text, agent, key, html) {
    return { text: text, agent: agent || null, key: key || text, html: html || null };
  };

  self.previewLinkLog = function (text, agent, key, portals) {
    var html = self.escape(text);
    (portals || []).forEach(function (item) {
      html = html.replace(self.escape(item.label), self.previewPortalLinkHtml(item.label, item.portal));
    });
    return self.previewLog(text, agent, key, html);
  };

  self.previewPortalLinkHtml = function (label, portal) {
    return '<a href="#" onclick="window.selectPortalByLatLng(' + self.escapeAttr(portal.lat) + ', ' + self.escapeAttr(portal.lng) + '); return false;">' + self.escape(label) + '</a>';
  };

  self.previewDoneKey = function (result, row) {
    return self.previewPlanKey(result) + '|' + row.key;
  };

  self.previewPlanKey = function (result) {
    return [
      self.resultAs(result).map(function (p) { return p.guid; }).join(','),
      result.spine.map(function (p) { return p.guid; }).join(','),
      result.Bs.map(function (p) { return p.guid; }).join(',')
    ].join('|');
  };

  self.requiredAKeys = function (result) {
    var aCount = result ? self.resultAs(result).length : 1;
    return ((result && result.spine ? result.spine.length : self.settings.spineSize) +
      (result && result.Bs ? result.Bs.length : self.settings.repeatBases)) * aCount;
  };

  self.previewStepModel = function (result, step) {
    if (step === 0) return self.previewKeyStep(result);
    if (step === 1) return self.previewCommonStep(result);
    return self.previewBStep(result, step - 2);
  };

  self.previewKeyStep = function (result) {
    var required = self.requiredAKeys(result);
    var aCount = self.resultAs(result).length;
    return {
      name: 'P1',
      title: 'P1. A鍵堀',
      note: '必要なA鍵数を計算します。',
      logs: [
        self.previewLog('A鍵必要数を計算します。', null, 'P1-key-start'),
        self.previewLog('計算: (背骨' + result.spine.length + '本 + Bおかわり' + result.Bs.length + '個) × A' + aCount + '個 = ' + required + '本。', null, 'P1-key-calc'),
        self.previewLog('最低目安: 基点Aキーを' + required + '本以上掘ります。', null, 'P1-key-result')
      ]
    };
  };

  self.previewCommonStep = function (result) {
    var logs = [self.previewLog('背骨間リンクは' + self.agentLabel('C') + 'が作成します。', null, 'P2-spine-note')];
    var basesA = self.resultAs(result);
    for (var i = 0; i < result.spine.length - 1; i++) {
      logs.push(self.previewLinkLog(
        self.agentLabel('C') + ': ' + self.spineLabel(i) + ' ' + result.spine[i].name + ' から ' + self.spineLabel(i + 1) + ' ' + result.spine[i + 1].name + ' へリンク',
        'C',
        'P2-spine-' + i,
        [
          { label: self.spineLabel(i) + ' ' + result.spine[i].name, portal: result.spine[i] },
          { label: self.spineLabel(i + 1) + ' ' + result.spine[i + 1].name, portal: result.spine[i + 1] }
        ]
      ));
    }
    logs.push(self.previewLog('背骨から各基点Aへのリンクを作成します。' + self.agentLabel('B') + ' / ' + self.agentLabel('A') + 'の順番です。', null, 'P2-A-note'));
    for (var ai = 0; ai < basesA.length; ai++) {
      var aLabel = self.aLabel(ai, basesA.length);
      for (var a = 0; a < result.spine.length; a++) {
        var agent = self.agentForASpineLink(a);
        logs.push(self.previewLinkLog(
          self.agentLabel(agent) + ': ' + self.spineLabel(a) + ' ' + result.spine[a].name + ' から 基点' + aLabel + ' ' + basesA[ai].name + ' へリンク',
          agent,
          'P2-' + aLabel + '-' + a,
          [
            { label: self.spineLabel(a) + ' ' + result.spine[a].name, portal: result.spine[a] },
            { label: '基点' + aLabel + ' ' + basesA[ai].name, portal: basesA[ai] }
          ]
        ));
      }
    }
    return {
      name: 'P2',
      title: 'P2. 背骨間リンクと背骨から基点A群へのリンク',
      note: '背骨間は緑、背骨から各基点Aへのリンクは 黒, 赤, 黒, 赤... の担当順で描画します。',
      logs: logs
    };
  };

  self.previewBStep = function (result, bIndex) {
    var baseB = result.Bs[bIndex];
    var label = 'B' + (bIndex + 1);
    var basesA = self.resultAs(result);
    var logs = [
      self.previewLog(label + 'おかわりポイントからのリンクを作成します。前のB起点リンクは描画から消します。', null, 'P' + (bIndex + 3) + '-note')
    ];
    for (var ai = 0; ai < basesA.length; ai++) {
      var aLabel = self.aLabel(ai, basesA.length);
      logs.push(self.previewLinkLog(
        self.agentLabel('C') + ': ' + label + ' ' + baseB.name + ' から 基点' + aLabel + ' ' + basesA[ai].name + ' へリンク',
        'C',
        'P' + (bIndex + 3) + '-B-' + aLabel,
        [
          { label: label + ' ' + baseB.name, portal: baseB },
          { label: '基点' + aLabel + ' ' + basesA[ai].name, portal: basesA[ai] }
        ]
      ));
    }
    for (var i = 0; i < result.spine.length; i++) {
      var agent = self.agentForBSpineLink(i);
      logs.push(self.previewLinkLog(
        self.agentLabel(agent) + ': ' + label + ' ' + baseB.name + ' から ' + self.spineLabel(i) + ' ' + result.spine[i].name + ' へリンク',
        agent,
        'P' + (bIndex + 3) + '-B-spine-' + i,
        [
          { label: label + ' ' + baseB.name, portal: baseB },
          { label: self.spineLabel(i) + ' ' + result.spine[i].name, portal: result.spine[i] }
        ]
      ));
    }
    logs.push(self.previewLog(label + 'の全リンク完了後、ウイルスを使用して反転破壊します。', null, 'P' + (bIndex + 3) + '-virus'));
    return {
      name: 'P' + (bIndex + 3),
      title: 'P' + (bIndex + 3) + '. ' + label + 'おかわりポイント',
      note: label + 'から各基点Aは緑、' + label + 'から背骨は 赤, 黒, 赤, 黒... の担当順で描画します。',
      logs: logs
    };
  };

  self.bindPreviewEvents = function () {
    var root = document.getElementById('okawari-preview-content');
    if (!root) return;
    if (root._okawariPreviewBound) return;
    root._okawariPreviewBound = true;
    root.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.getAttribute) return;
      var action = target.getAttribute('data-preview-action');
      if (!action) return;
      var result = self.results[self.selectedResult];
      if (!result) return;
      var last = self.previewStepCount(result) - 1;
      if (action === 'first') self.previewState.step = 0;
      if (action === 'prev') self.previewState.step = Math.max(0, (self.previewState.step || 0) - 1);
      if (action === 'next') self.previewState.step = Math.min(last, (self.previewState.step || 0) + 1);
      if (action === 'last') self.previewState.step = last;
      if (action === 'clear') {
        self.clearMap();
        return;
      }
      self.renderPreviewDialog();
    });
    root.addEventListener('change', function (ev) {
      var target = ev.target;
      if (!target || !target.getAttribute) return;
      var doneKey = target.getAttribute('data-preview-done');
      if (doneKey) {
        if (!self.previewState.done) self.previewState.done = {};
        if (target.checked) self.previewState.done[doneKey] = true;
        else delete self.previewState.done[doneKey];
        self.savePreviewState();
        return;
      }
      var agent = target.getAttribute('data-preview-agent');
      if (!agent) return;
      self.previewState.agents[agent] = target.checked;
      self.savePreviewState();
      self.renderPreviewDialog();
    });
  };

  self.buildOutputHtml = function (result) {
    var jsonData = self.resultToExportData(result);
    var bookmarkData = self.resultToBookmarkExportData(result);
    var drawData = self.resultToDrawExportData(result);
    var previewCsv = self.resultToPreviewCsv(result);
    return [
      '<div class="okawari-root">',
      '<div class="okawari-output-actions">',
      self.outputActionCardHtml('json', 'JSON', '独自形式'),
      self.outputActionCardHtml('bookmark', 'Bookmark', '使用するポータルのブックマークデータ'),
      self.outputActionCardHtml('draw', 'DrawData', '背骨とA群とBの各おかわりポータルから線を引いた状態'),
      self.outputActionCardHtml('preview-csv', '計画プレビューCSV', 'P1から最後のおかわりPまでの実行ログ全件'),
      '</div>',
      '<div class="okawari-output-copy">',
      self.outputTextareaHtml('JSON', jsonData),
      self.outputTextareaHtml('Bookmark', bookmarkData),
      self.outputTextareaHtml('DrawData', drawData),
      self.outputTextHtml('計画プレビューCSV', previewCsv),
      '</div>',
      '</div>'
    ].join('');
  };

  self.outputActionCardHtml = function (kind, title, desc) {
    return '<div class="okawari-output-card">' +
      '<button type="button" data-output="' + kind + '">' + self.escape(title) + '</button>' +
      '<div>' + self.escape(desc) + '</div>' +
      '</div>';
  };

  self.outputTextareaHtml = function (title, data) {
    return '<details>' +
      '<summary>' + self.escape(title) + '</summary>' +
      '<textarea readonly>' + self.escape(JSON.stringify(data, null, 2)) + '</textarea>' +
      '</details>';
  };

  self.outputTextHtml = function (title, text) {
    return '<details>' +
      '<summary>' + self.escape(title) + '</summary>' +
      '<textarea readonly>' + self.escape(text) + '</textarea>' +
      '</details>';
  };

  self.resultToPreviewCsv = function (result) {
    var rows = [['P', 'StepTitle', 'No', 'Agent', 'Done', 'Log']];
    for (var step = 0; step < self.previewStepCount(result); step++) {
      var model = self.previewStepModel(result, step);
      model.logs.forEach(function (row, index) {
        var key = self.previewDoneKey(result, row);
        rows.push([
          model.name,
          model.title,
          index + 1,
          row.agent || '',
          self.previewState.done && self.previewState.done[key] ? 'TRUE' : 'FALSE',
          row.text
        ]);
      });
    }
    return rows.map(function (row) {
      return row.map(self.csvEscape).join(',');
    }).join('\r\n');
  };

  self.csvEscape = function (value) {
    if (value === undefined || value === null) return '';
    return '"' + String(value).replace(/"/g, '""') + '"';
  };

  self.bindOutputEvents = function () {
    var root = document.getElementById('okawari-output-content');
    if (!root) return;
    if (root._okawariOutputBound) return;
    root._okawariOutputBound = true;
    root.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.getAttribute) return;
      var kind = target.getAttribute('data-output');
      if (!kind) return;
      var result = self.results[self.selectedResult];
      if (!result) return;
      if (kind === 'json') self.downloadJson(self.resultToExportData(result), 'okawari-finder');
      if (kind === 'bookmark') self.downloadJson(self.resultToBookmarkExportData(result), 'okawari-bookmarks');
      if (kind === 'draw') self.downloadJson(self.resultToDrawExportData(result), 'okawari-draw-data');
      if (kind === 'preview-csv') self.downloadText('\ufeff' + self.resultToPreviewCsv(result), 'okawari-plan-preview', 'csv', 'text/csv;charset=utf-8');
    });
  };

  self.buildHtml = function () {
    return [
      '<div id="okawari-root" class="okawari-root">',
      self.warningHtml(),
      self.targetPortalFrameHtml(),
      self.planFrameHtml(),
      self.summaryHtml(),
      self.resultsHtml(),
      '</div>'
    ].join('');
  };

  self.toolbarHtml = function () {
    return [
      '<div class="okawari-toolbar">',
      '<button type="button" data-action="load">ブックマーク読込</button>',
      '<button type="button" data-action="find">B密度優先探索</button>',
      '<button type="button" data-action="open-output">出力</button>',
      '<button type="button" data-action="load-result">結果読込</button>',
      '<input type="file" data-role="result-file" accept="application/json,.json" style="display:none;">',
      '<label>おかわりB <input type="number" min="1" max="12" data-setting="repeatBases" value="' + self.escape(self.settings.repeatBases) + '"></label>',
      '<label>B密度半径m <input type="number" min="50" max="1000" data-setting="bClusterRadius" value="' + self.escape(self.settings.bClusterRadius) + '"></label>',
      '<label>被り判定m <input type="number" min="1" max="80" data-setting="overlapMeters" value="' + self.escape(self.settings.overlapMeters) + '"></label>',
      '<label><input type="checkbox" data-setting="drawOnMap" ' + (self.settings.drawOnMap ? 'checked' : '') + '>マップ描画</label>',
      '<span>背骨: 15固定</span>',
      '</div>'
    ].join('');
  };

  self.targetPortalFrameHtml = function () {
    return [
      '<fieldset class="okawari-fieldset">',
      '<legend>対象ポータル一覧</legend>',
      '<div class="okawari-actions">',
      '<button type="button" data-action="load">ブックマークから読込</button>',
      '<button type="button" data-action="toggle-map-pick">マップクリック追加: ' + (self.mapPickEnabled ? 'ON' : 'OFF') + '</button>',
      '<button type="button" data-action="clear-targets">対象ポータル一括削除</button>',
      '</div>',
      self.targetPortalListHtml(),
      self.targetPortalExportDetailsHtml('CSV', self.targetPortalCsvText()),
      self.targetPortalExportDetailsHtml('JSON', JSON.stringify(self.targetPortalJsonData(), null, 2)),
      '</fieldset>'
    ].join('');
  };

  self.planFrameHtml = function () {
    return [
      '<fieldset class="okawari-fieldset">',
      '<legend>おかわかりCF計画</legend>',
      '<div class="okawari-plan-settings">',
      '<label>おかわりB <input type="number" min="1" max="12" data-setting="repeatBases" value="' + self.escape(self.settings.repeatBases) + '"></label>',
      '<label>B密度半径m <input type="number" min="50" max="1000" data-setting="bClusterRadius" value="' + self.escape(self.settings.bClusterRadius) + '"></label>',
      '<label>被り判定m <input type="number" min="1" max="80" data-setting="overlapMeters" value="' + self.escape(self.settings.overlapMeters) + '"></label>',
      '<label><input type="checkbox" data-setting="drawOnMap" ' + (self.settings.drawOnMap ? 'checked' : '') + '>マップ描画</label>',
      '</div>',
      '<div class="okawari-actions">',
      '<button type="button" data-action="find">計画生成</button>',
      '<button type="button" data-action="draw-selected">地図に描画</button>',
      '<button type="button" data-action="preview-plan">計画プレビュー</button>',
      '<button type="button" data-action="settings">設定</button>',
      '<button type="button" data-action="open-output">出力</button>',
      '<button type="button" data-action="load-result">計画読込</button>',
      '<input type="file" data-role="result-file" accept="application/json,.json" style="display:none;">',
      '</div>',
      self.settingsPanelHtml(),
      '<div class="okawari-message">' + self.escape(self.message) + '</div>',
      self.manualAControlsHtml(),
      self.manualBControlsHtml(),
      '</fieldset>'
    ].join('');
  };

  self.settingsPanelHtml = function () {
    if (!self.settingsOpen) return '';
    return [
      '<div class="okawari-panel okawari-manual-b">',
      '<h4>設定</h4>',
      '<div class="okawari-plan-settings">',
      '<label>担当A <input type="text" data-setting="agentA" value="' + self.escape(self.settings.agents.A) + '"></label>',
      '<label>担当B <input type="text" data-setting="agentB" value="' + self.escape(self.settings.agents.B) + '"></label>',
      '<label>担当C <input type="text" data-setting="agentC" value="' + self.escape(self.settings.agents.C) + '"></label>',
      '<label>メイン位置 ' + self.dialogPositionSelectHtml('mainPosition', self.settings.ui.mainPosition) + '</label>',
      '<label>プレビュー位置 ' + self.dialogPositionSelectHtml('previewPosition', self.settings.ui.previewPosition) + '</label>',
      '</div>',
      '<div class="okawari-muted">名前や画面位置を変更したら、もう一度「設定」を押すと反映します。</div>',
      '</div>'
    ].join('');
  };

  self.dialogPositionSelectHtml = function (setting, value) {
    var options = [
      { value: 'left', label: '左' },
      { value: 'center', label: '中央' },
      { value: 'right', label: '右' }
    ].map(function (item) {
      return '<option value="' + item.value + '" ' + (value === item.value ? 'selected' : '') + '>' + item.label + '</option>';
    }).join('');
    return '<select data-setting="' + setting + '">' + options + '</select>';
  };

  self.manualBControlsHtml = function () {
    var result = self.results[self.selectedResult];
    if (!result) return '';
    var originalBCount = result.originalBCount || result.Bs.length;
    var manualBCount = Math.max(0, result.Bs.length - originalBCount);
    return [
      '<div class="okawari-panel okawari-manual-b">',
      '<h4>B手動追加</h4>',
      '<div>自動B: ' + originalBCount + '件 / 手動追加B: ' + manualBCount + '件 / 合計B: ' + result.Bs.length + '件</div>',
      '<div class="okawari-actions">',
      '<button type="button" data-action="toggle-manual-b">B手動追加: ' + (self.manualBPickEnabled ? 'ON' : 'OFF') + '</button>',
      '<button type="button" data-action="remove-last-manual-b">最後のBを削除</button>',
      '<button type="button" data-action="clear-manual-b">手動Bをクリア</button>',
      '</div>',
      '<div class="okawari-muted">ONの間、マップ上のポータルをクリックすると選択中の計画へBとして追加します。</div>',
      '</div>'
    ].join('');
  };

  self.manualAControlsHtml = function () {
    var result = self.results[self.selectedResult];
    if (!result) return '';
    var basesA = self.resultAs(result);
    var originalACount = self.originalACount(result, basesA);
    var manualACount = Math.max(0, basesA.length - originalACount);
    return [
      '<div class="okawari-panel okawari-manual-b">',
      '<h4>A手動変更・追加</h4>',
      '<div>自動A: ' + originalACount + '件 / 手動追加A: ' + manualACount + '件 / 合計A: ' + basesA.length + '件</div>',
      '<div class="okawari-muted">' + basesA.map(function (p, i) {
        return self.aLabel(i, basesA.length) + ': ' + self.escape(p.name);
      }).join(' / ') + '</div>',
      '<div class="okawari-actions">',
      '<button type="button" data-action="toggle-manual-a">A手動変更・追加: ' + (self.manualAPickEnabled ? 'ON' : 'OFF') + '</button>',
      '<button type="button" data-action="remove-last-manual-a">最後のAを削除</button>',
      '<button type="button" data-action="clear-manual-a">手動Aをクリア</button>',
      '</div>',
      '<div class="okawari-muted">ONの間、マップ上のポータルをクリックすると選択中の計画へAとして追加します。</div>',
      '</div>'
    ].join('');
  };

  self.warningHtml = function () {
    if (!self.warnings.length) return '';
    return '<div class="okawari-warning">' + self.warnings.map(self.escape).join('<br>') + '</div>';
  };

  self.summaryHtml = function () {
    return [
      '<div class="okawari-summary">',
      '<div>対象ポータル<br><b>' + self.bookmarkPortals.length + '</b></div>',
      '<div>計画対象<br><b>' + self.selectedSpine.length + ' / 15</b></div>',
      '<div>画面内ポータル<br><b>' + self.getVisiblePortalCountSafe() + '</b></div>',
      '<div>候補<br><b>' + self.results.length + '</b></div>',
      '<div>スコア条件<br><b>Field 90 / Link 2</b></div>',
      '</div>'
    ].join('');
  };

  self.targetPortalListHtml = function () {
    self.enrichTargetPortals();
    var ordered = self.bookmarkPortals.length ? self.bookmarkPortals.slice() : [];
    var rows = ordered.map(function (p, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><a class="okawari-target-name" onclick="window.selectPortalByLatLng(' + self.escapeAttr(p.lat) + ', ' + self.escapeAttr(p.lng) + '); return false;">' + self.escape(p.name) + '</a></td>' +
        '<td>' + self.escape(self.portalDisplayValue(p.team)) + '</td>' +
        '<td>' + self.escape(self.portalDisplayValue(p.level)) + '</td>' +
        '<td>' + self.escape(p.lat.toFixed(6)) + ', ' + self.escape(p.lng.toFixed(6)) + '</td>' +
        '<td>' + self.escape(self.portalDisplayValue(p.status)) + '</td>' +
        '<td><button type="button" data-action="remove-target" data-guid="' + self.escape(p.guid) + '">削除</button></td>' +
        '</tr>';
    }).join('');
    if (!rows) {
      rows = '<tr><td colspan="7" class="okawari-muted">対象ポータルはありません。</td></tr>';
    }
    return [
      '<details class="okawari-target-details" data-role="target-list" ' + (self.targetsOpen ? 'open' : '') + '>',
      '<summary>背骨対象ポータル (' + self.bookmarkPortals.length + '件)</summary>',
      '<div class="okawari-target-tablewrap">',
      '<table class="okawari-target-table">',
      '<thead><tr><th>#</th><th>Portal</th><th>Team</th><th>Lv</th><th>Lat/Lng</th><th>Status</th><th></th></tr></thead>',
      '<tbody>' + rows + '</tbody>',
      '</table>',
      '</div>',
      '</details>'
    ].join('');
  };

  self.targetPortalExportDetailsHtml = function (title, text) {
    return '<details class="okawari-target-details">' +
      '<summary>' + self.escape(title) + '</summary>' +
      '<textarea class="okawari-target-export" readonly style="height:' + (title === 'CSV' ? '100px' : '120px') + ';">' + self.escape(text) + '</textarea>' +
      '</details>';
  };

  self.targetPortalCsvText = function () {
    var rows = [['No', 'Portal', 'Team', 'Lv', 'Lat', 'Lng', 'Status']];
    self.bookmarkPortals.forEach(function (p, i) {
      rows.push([
        i + 1,
        p.name,
        self.portalDisplayValue(p.team),
        self.portalDisplayValue(p.level),
        p.lat,
        p.lng,
        self.portalDisplayValue(p.status)
      ]);
    });
    return rows.map(function (row) {
      return row.map(function (value) {
        return '"' + String(value).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
  };

  self.targetPortalJsonData = function () {
    return self.bookmarkPortals.map(function (p, i) {
      return {
        no: i + 1,
        guid: p.guid,
        name: p.name,
        team: self.portalDisplayValue(p.team),
        level: self.portalDisplayValue(p.level),
        lat: p.lat,
        lng: p.lng,
        status: self.portalDisplayValue(p.status)
      };
    });
  };

  self.portalDisplayValue = function (value) {
    if (value === undefined || value === null || value === '') return '-';
    return value;
  };

  self.enrichTargetPortals = function () {
    self.bookmarkPortals = self.bookmarkPortals.map(function (p) {
      return self.enrichPortal(p);
    });
    self.selectedSpine = self.selectedSpine.map(function (p) {
      return self.enrichPortal(p);
    });
  };

  self.enrichPortal = function (p) {
    var live = window.portals && window.portals[p.guid];
    if (!live || !live.getLatLng) return p;
    var ll = live.getLatLng();
    var data = live.options && live.options.data ? live.options.data : {};
    return self.makePortal(p.guid, data.title || data.name || p.name, ll.lat, ll.lng, {
      team: data.team || p.team,
      level: data.level || p.level,
      status: data.health || data.status || p.status
    });
  };

  self.bookmarkListHtml = function () {
    var selectedIds = {};
    self.selectedSpine.forEach(function (p) { selectedIds[p.guid] = true; });
    var rows = self.bookmarkPortals.map(function (p) {
      return '<div class="okawari-row ' + (selectedIds[p.guid] ? 'selected' : '') + '">' +
        '<input type="checkbox" data-action="toggle-spine" data-guid="' + self.escape(p.guid) + '" ' + (selectedIds[p.guid] ? 'checked' : '') + '>' +
        '<span>' + self.escape(p.name) + '</span>' +
        '<span class="okawari-muted">' + self.escape(p.lat.toFixed(5)) + ', ' + self.escape(p.lng.toFixed(5)) + '</span>' +
        '</div>';
    }).join('');
    return '<div class="okawari-panel"><h4>ブックマーク一覧</h4><div class="okawari-list">' + rows + '</div></div>';
  };

  self.selectedSpineHtml = function () {
    var ordered = self.selectedSpine.length ? self.orderSpine(self.selectedSpine) : [];
    var rows = ordered.map(function (p, i) {
      return '<div class="okawari-row selected">' +
        '<b>' + self.spineLabel(i) + '</b>' +
        '<span>' + self.escape(p.name) + '</span>' +
        '<button type="button" data-action="remove-spine" data-guid="' + self.escape(p.guid) + '">削除</button>' +
        '</div>';
    }).join('');
    return '<div class="okawari-panel"><h4>選択中の背骨</h4><div class="okawari-list">' + rows + '</div></div>';
  };

  self.resultsHtml = function () {
    var rows = self.results.map(function (r, i) {
      var basesA = self.resultAs(r);
      return '<tr class="' + (i === self.selectedResult ? 'selected' : '') + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + self.escape(basesA.map(function (p) { return p.name; }).join(' / ')) + '</td>' +
        '<td>' + r.shapeScore + '</td>' +
        '<td><button type="button" data-action="select-result" data-index="' + i + '">選択</button></td>' +
        '</tr>';
    }).join('');
    return '<div class="okawari-tablewrap"><table class="okawari-table"><thead><tr><th>Rank</th><th>基点A</th><th>Shape</th><th>選択</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  };

  self.detailHtml = function (result) {
    return '';
  };

  self.bindEvents = function () {
    var root = document.getElementById('okawari-root');
    if (!root) return;
    if (root._okawariEventsBound) return;
    root._okawariEventsBound = true;
    root.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.getAttribute) return;
      var action = target.getAttribute('data-action');
      if (!action && target.closest) {
        target = target.closest('[data-action]');
        action = target && target.getAttribute ? target.getAttribute('data-action') : null;
      }
      if (action === 'load') self.loadBookmarks();
      if (action === 'toggle-map-pick') {
        self.mapPickEnabled = !self.mapPickEnabled;
        self.message = self.mapPickEnabled ?
          'マップ上のポータルをクリックすると対象ポータルに追加します。' :
          'マップクリック追加をOFFにしました。';
        self.renderDialog();
      }
      if (action === 'clear-targets') self.clearTargetPortals();
      if (action === 'find') self.findAB();
      if (action === 'draw-selected') {
        self.readSettings();
        if (self.results[self.selectedResult]) self.drawResult(self.results[self.selectedResult]);
        else self.drawTargetPins();
        self.message = self.results[self.selectedResult] ? '選択中の計画を地図に描画しました。' : '対象ポータルを地図にピン表示しました。';
        self.renderDialog();
      }
      if (action === 'preview-plan') {
        self.renderPreviewDialog();
        self.message = self.results[self.selectedResult] ? '計画プレビューを表示しています。' : 'まだ計画がありません。先に計画生成してください。';
        self.renderDialog();
      }
      if (action === 'settings') {
        if (self.settingsOpen) {
          self.readSettings();
          self.settingsOpen = false;
          self.message = '設定を反映しました。';
        } else {
          self.settingsOpen = true;
          self.message = '担当A/B/Cの名前を入力できます。入力後、もう一度「設定」を押すと反映します。';
        }
        self.renderDialog();
      }
      if (action === 'toggle-manual-b') {
        self.manualBPickEnabled = !self.manualBPickEnabled;
        if (self.manualBPickEnabled) self.manualAPickEnabled = false;
        self.message = self.manualBPickEnabled ?
          'B手動追加をONにしました。マップ上のポータルをクリックすると、選択中の計画へBとして追加します。' :
          'B手動追加をOFFにしました。';
        self.renderDialog();
      }
      if (action === 'toggle-manual-a') {
        self.manualAPickEnabled = !self.manualAPickEnabled;
        if (self.manualAPickEnabled) self.manualBPickEnabled = false;
        self.message = self.manualAPickEnabled ?
          'A手動変更・追加をONにしました。マップ上のポータルをクリックすると、選択中の計画へAとして追加します。' :
          'A手動変更・追加をOFFにしました。';
        self.renderDialog();
      }
      if (action === 'remove-last-manual-a') self.removeLastManualA();
      if (action === 'clear-manual-a') self.clearManualAs();
      if (action === 'remove-last-manual-b') self.removeLastManualB();
      if (action === 'clear-manual-b') self.clearManualBs();
      if (action === 'open-output') self.renderOutputDialog();
      if (action === 'save-bookmarks') self.saveBookmarksResult();
      if (action === 'save-draw') self.saveDrawResult();
      if (action === 'save-custom') self.saveCustomResult();
      if (action === 'load-result') {
        var input = root.querySelector('[data-role="result-file"]');
        if (input) input.click();
      }
      if (action === 'remove-spine') self.removeSelectedSpine(target.getAttribute('data-guid'));
      if (action === 'remove-target') self.removeSelectedSpine(target.getAttribute('data-guid'));
      if (action === 'select-result') {
        self.selectedResult = parseInt(target.getAttribute('data-index'), 10);
        self.renderDialog();
        if (self.settings.drawOnMap) self.drawResult(self.results[self.selectedResult]);
      }
    });
    root.addEventListener('change', function (ev) {
      var target = ev.target;
      if (target && target.getAttribute('data-role') === 'result-file') {
        self.loadResultFile(target.files && target.files[0]);
        target.value = '';
        return;
      }
      if (!target || target.getAttribute('data-action') !== 'toggle-spine') return;
      self.toggleSpine(target.getAttribute('data-guid'));
    });
    root.addEventListener('toggle', function (ev) {
      var target = ev.target;
      if (!target || !target.classList || !target.classList.contains('okawari-target-details')) return;
      if (target.getAttribute('data-role') !== 'target-list') return;
      self.targetsOpen = target.open;
    }, true);
  };

  self.readSettings = function () {
    var root = document.getElementById('okawari-root');
    if (!root) return;
    var repeatBases = parseInt(root.querySelector('[data-setting="repeatBases"]').value, 10);
    var bClusterRadius = parseFloat(root.querySelector('[data-setting="bClusterRadius"]').value);
    var overlapMeters = parseFloat(root.querySelector('[data-setting="overlapMeters"]').value);
    var agentA = root.querySelector('[data-setting="agentA"]');
    var agentB = root.querySelector('[data-setting="agentB"]');
    var agentC = root.querySelector('[data-setting="agentC"]');
    var mainPosition = root.querySelector('[data-setting="mainPosition"]');
    var previewPosition = root.querySelector('[data-setting="previewPosition"]');
    self.settings.repeatBases = isFinite(repeatBases) ? Math.max(1, Math.min(12, repeatBases)) : 10;
    self.settings.bClusterRadius = isFinite(bClusterRadius) ? Math.max(50, Math.min(1000, bClusterRadius)) : 400;
    self.settings.overlapMeters = isFinite(overlapMeters) ? Math.max(1, Math.min(80, overlapMeters)) : 1;
    if (agentA) self.settings.agents.A = agentA.value.trim() || 'エージェントA';
    if (agentB) self.settings.agents.B = agentB.value.trim() || 'エージェントB';
    if (agentC) self.settings.agents.C = agentC.value.trim() || 'エージェントC';
    if (mainPosition && self.validDialogPosition(mainPosition.value)) self.settings.ui.mainPosition = mainPosition.value;
    if (previewPosition && self.validDialogPosition(previewPosition.value)) self.settings.ui.previewPosition = previewPosition.value;
    self.settings.drawOnMap = root.querySelector('[data-setting="drawOnMap"]').checked;
    self.saveUiSettings();
    self.applyDialogPosition('okawari-finder-content', self.settings.ui.mainPosition, 1100, 'min(760px, 52vw)');
    self.applyDialogPosition('okawari-preview-content', self.settings.ui.previewPosition, 760, 'min(760px, 46vw)');
  };

  self.spineLabel = function (index) {
    return 'S' + (index + 1);
  };

  self.agentNames = function () {
    return {
      A: self.settings.agents.A,
      B: self.settings.agents.B,
      C: self.settings.agents.C
    };
  };

  self.agentName = function (agent) {
    return self.settings.agents[agent] || agent;
  };

  self.agentLabel = function (agent) {
    var name = self.agentName(agent);
    var defaultName = 'エージェント' + agent;
    return '担当' + agent + (name && name !== defaultName ? '(' + name + ')' : '');
  };

  self.drawPreviewStep = function (result) {
    if (!result || !self.layerGroup) return;
    self.layerGroup.clearLayers();
    var step = Math.max(0, Math.min(self.previewState.step || 0, self.previewStepCount(result) - 1));
    var basesA = self.resultAs(result);

    if (step >= 1) {
      for (var i = 0; i < result.spine.length - 1; i++) {
        if (self.previewState.agents.C !== false) self.addPreviewLine(result.spine[i], result.spine[i + 1], 'C', 4, 0.9);
      }
      for (var ai = 0; ai < basesA.length; ai++) {
        for (var a = 0; a < result.spine.length; a++) {
          var aAgent = self.agentForASpineLink(a);
          if (self.previewState.agents[aAgent] !== false) self.addPreviewLine(result.spine[a], basesA[ai], aAgent, 2, 0.78);
        }
      }
    }

    if (step >= 2) {
      var bIndex = step - 2;
      var baseB = result.Bs[bIndex];
      if (baseB) {
        if (self.previewState.agents.C !== false) {
          for (var bi = 0; bi < basesA.length; bi++) self.addPreviewLine(baseB, basesA[bi], 'C', 4, 0.9);
        }
        for (var j = 0; j < result.spine.length; j++) {
          var bAgent = self.agentForBSpineLink(j);
          if (self.previewState.agents[bAgent] !== false) self.addPreviewLine(baseB, result.spine[j], bAgent, 2, 0.78);
        }
      }
    }

    self.addPreviewMarkers(result, step);
  };

  self.addPreviewLine = function (from, to, agent, weight, opacity) {
    L.polyline([from.latLng, to.latLng], {
      color: self.colors[agent],
      weight: weight || 2,
      opacity: opacity || 0.75
    }).addTo(self.layerGroup);
  };

  self.addPreviewMarkers = function (result, step) {
    var basesA = self.resultAs(result);
    var rows = basesA.map(function (p, i) {
      return [self.aLabel(i, basesA.length), p];
    }).concat(result.spine.map(function (p, i) {
      return [self.spineLabel(i), p];
    }));
    if (step >= 2 && result.Bs[step - 2]) rows.push(['B' + (step - 1), result.Bs[step - 2]]);
    if (step < 2) {
      rows = rows.concat(result.Bs.map(function (p, i) {
        return ['B' + (i + 1), p];
      }));
    }
    rows.forEach(function (row) {
      L.marker(row[1].latLng, {
        icon: L.divIcon({
          className: '',
          html: '<span class="okawari-label">' + row[0] + '</span>',
          iconSize: null
        }),
        interactive: false
      }).addTo(self.layerGroup);
    });
  };

  self.drawResult = function (result) {
    if (!result || !self.layerGroup) return;
    self.layerGroup.clearLayers();
    var basesA = self.resultAs(result);

    L.polyline(result.spine.map(function (p) { return p.latLng; }), {
      color: self.colors.spine,
      weight: 4,
      opacity: 0.95
    }).addTo(self.layerGroup);

    result.plan.forEach(function (link) {
      L.polyline([link.from.latLng, link.to.latLng], {
        color: self.colors[link.agent],
        weight: link.label === '背骨リンク' || link.label === 'B-A底辺リンク' ? 4 : 2,
        opacity: link.label.indexOf('基点B-') === 0 ? 0.45 : 0.75
      }).addTo(self.layerGroup);
    });

    basesA.map(function (p, i) {
      return [self.aLabel(i, basesA.length), p];
    }).concat(result.Bs.map(function (p, i) {
      return ['B' + (i + 1), p];
    })).concat(result.spine.map(function (p, i) {
      return [self.spineLabel(i), p];
    })).forEach(function (row) {
      L.marker(row[1].latLng, {
        icon: L.divIcon({
          className: '',
          html: '<span class="okawari-label">' + row[0] + '</span>',
          iconSize: null
        }),
        interactive: false
      }).addTo(self.layerGroup);
    });
  };

  self.drawTargetPins = function () {
    if (!self.targetLayerGroup) return;
    self.enrichTargetPortals();
    self.targetLayerGroup.clearLayers();
    self.bookmarkPortals.forEach(function (p, i) {
      L.marker(p.latLng, {
        icon: L.divIcon({
          className: '',
          html: '<span class="okawari-label">#' + (i + 1) + '</span>',
          iconSize: null
        }),
        title: p.name
      }).bindPopup(
        '<b>' + self.escape(p.name) + '</b><br>' +
        self.escape(p.lat.toFixed(6)) + ', ' + self.escape(p.lng.toFixed(6))
      ).addTo(self.targetLayerGroup);
    });
  };

  self.clearMap = function () {
    if (self.layerGroup) self.layerGroup.clearLayers();
  };

  self.getVisiblePortalCountSafe = function () {
    try { return self.getVisiblePortals().length; } catch (e) { return 0; }
  };

  self.orderSpine = function (spine) {
    if (spine.length <= 2) return spine.slice();
    var bestA = spine[0];
    var bestB = spine[1];
    var best = -1;
    for (var i = 0; i < spine.length - 1; i++) {
      for (var j = i + 1; j < spine.length; j++) {
        var distance = self.distMeters(spine[i], spine[j]);
        if (distance > best) {
          best = distance;
          bestA = spine[i];
          bestB = spine[j];
        }
      }
    }
    var axis = self.msub(bestB, bestA);
    return spine.slice().sort(function (p, q) {
      return self.projectMetersRatio(p, bestA, axis) - self.projectMetersRatio(q, bestA, axis);
    });
  };

  self.baseCreatesValidFan = function (base, spine) {
    for (var i = 0; i < spine.length; i++) {
      if (self.linkHitsOtherSpinePortal(base, spine[i], spine)) return false;
    }
    return true;
  };

  self.linkHitsOtherSpinePortal = function (from, to, spine) {
    for (var i = 0; i < spine.length; i++) {
      var p = spine[i];
      if (p.guid === to.guid || p.guid === from.guid) continue;
      var distance = self.pointSegmentDistanceMeters(p, from, to);
      if (distance <= self.settings.overlapMeters && self.isBetweenMeters(p, from, to)) return true;
    }
    return false;
  };

  self.spineApexForBase = function (baseA, baseB, spine) {
    return spine.slice().sort(function (p, q) {
      return self.pointLineDistanceMeters(q, baseA, baseB) - self.pointLineDistanceMeters(p, baseA, baseB);
    })[0];
  };

  self.orientSpineForBase = function (baseA, baseB, spine) {
    if (!baseB) return spine.slice();
    return spine.slice().sort(function (p, q) {
      return self.pointLineDistanceMeters(q, baseA, baseB) - self.pointLineDistanceMeters(p, baseA, baseB);
    });
  };

  self.shapeScore = function (spine, baseA, basesB) {
    var ordered = self.orderSpine(spine);
    var start = ordered[0];
    var end = ordered[ordered.length - 1];
    var len = Math.max(self.distMeters(start, end), 1);
    var avgDistance = ordered.reduce(function (sum, p) {
      return sum + self.pointLineDistanceMeters(p, start, end);
    }, 0) / ordered.length;
    var straightness = Math.max(0, 100 - avgDistance * 1.6);

    var baseScore = Math.min(100, basesB.length / self.settings.repeatBases * 100);
    var okawariScore = self.okawariEaseScore(basesB).score;
    var triangleScore = basesB.reduce(function (sum, b) {
      return sum + self.triangleFitScore(baseA, b, spine);
    }, 0) / Math.max(basesB.length, 1);
    var width = Math.min(self.pointLineDistanceMeters(baseA, start, end), basesB.reduce(function (sum, b) {
      return sum + self.pointLineDistanceMeters(b, start, end);
    }, 0) / Math.max(basesB.length, 1));
    var widthScore = Math.min(100, width / Math.max(len * 0.2, 1) * 80);
    return {
      total: Math.round(straightness * 0.24 + triangleScore * 0.22 + widthScore * 0.12 + baseScore * 0.24 + okawariScore * 0.18),
      straightness: Math.round(straightness)
    };
  };

  self.shapeScoreForAs = function (spine, basesA, basesB) {
    basesA = basesA && basesA.length ? basesA : [];
    if (!basesA.length) return { total: 0, straightness: 0 };
    var totals = basesA.map(function (baseA) {
      return self.shapeScore(spine, baseA, basesB);
    });
    return {
      total: Math.round(totals.reduce(function (sum, item) { return sum + item.total; }, 0) / totals.length),
      straightness: Math.round(totals.reduce(function (sum, item) { return sum + item.straightness; }, 0) / totals.length)
    };
  };

  self.okawariEaseScore = function (basesB) {
    if (!basesB || basesB.length <= 1) {
      return { score: basesB && basesB.length ? 100 : 0, avgDistance: 0 };
    }

    var totalNearest = 0;
    for (var i = 0; i < basesB.length; i++) {
      var nearest = Infinity;
      for (var j = 0; j < basesB.length; j++) {
        if (i === j) continue;
        nearest = Math.min(nearest, self.distMeters(basesB[i], basesB[j]));
      }
      totalNearest += nearest;
    }

    var avgNearest = totalNearest / basesB.length;
    var score = Math.max(0, Math.min(100, 100 - avgNearest / 4));
    return { score: Math.round(score), avgDistance: avgNearest };
  };

  self.triangleFitScore = function (baseA, baseB, spine) {
    var apex = self.spineApexForBase(baseA, baseB, spine);
    var baseLength = Math.max(self.distMeters(baseA, baseB), 1);
    var height = Math.max(self.pointLineDistanceMeters(apex, baseA, baseB), 1);
    var offCenter = Math.abs(self.projectMetersRatio(apex, baseA, self.msub(baseB, baseA)) - 0.5);
    var shape = Math.min(100, height / Math.max(baseLength * 0.35, 1) * 70);
    return Math.max(0, shape - offCenter * 45);
  };

  self.baseQuality = function (base, spine) {
    var ordered = self.orderSpine(spine);
    var start = ordered[0];
    var end = ordered[ordered.length - 1];
    var len = Math.max(self.distMeters(start, end), 1);
    var distance = self.pointLineDistanceMeters(base, start, end);
    var center = self.midpointMeters(start, end);
    var centerPenalty = self.distPointToMeters(base, center) / len;
    return Math.min(100, distance / Math.max(len * 0.2, 1) * 80) - centerPenalty * 10;
  };

  self.aQualityForCluster = function (baseA, basesB, spine) {
    var triangle = basesB.reduce(function (sum, b) {
      return sum + self.triangleFitScore(baseA, b, spine);
    }, 0) / Math.max(basesB.length, 1);
    var spread = self.okawariEaseScore(basesB).score;
    return self.baseQuality(baseA, spine) + triangle + spread * 0.6;
  };

  self.lngToMeters = function (lng, lat) {
    return lng * 111320 * Math.cos(lat * Math.PI / 180);
  };

  self.latToMeters = function (lat) {
    return lat * 110540;
  };

  self.msub = function (a, b) {
    return { x: a.mx - b.mx, y: a.my - b.my };
  };

  self.mlen = function (v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  };

  self.distMeters = function (a, b) {
    return self.mlen(self.msub(a, b));
  };

  self.distPointToMeters = function (p, m) {
    var dx = p.mx - m.x;
    var dy = p.my - m.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  self.midpointMeters = function (a, b) {
    return { x: (a.mx + b.mx) / 2, y: (a.my + b.my) / 2 };
  };

  self.projectMetersRatio = function (p, origin, axis) {
    var vx = p.mx - origin.mx;
    var vy = p.my - origin.my;
    var len2 = axis.x * axis.x + axis.y * axis.y;
    return len2 ? (vx * axis.x + vy * axis.y) / len2 : 0;
  };

  self.pointSegmentDistanceMeters = function (p, a, b) {
    var axis = self.msub(b, a);
    var ratio = Math.max(0, Math.min(1, self.projectMetersRatio(p, a, axis)));
    var x = a.mx + axis.x * ratio;
    var y = a.my + axis.y * ratio;
    var dx = p.mx - x;
    var dy = p.my - y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  self.pointLineDistanceMeters = function (p, a, b) {
    var axis = self.msub(b, a);
    var len = Math.max(self.mlen(axis), 1);
    return Math.abs((p.mx - a.mx) * axis.y - (p.my - a.my) * axis.x) / len;
  };

  self.sideMeters = function (a, b, p) {
    return (b.mx - a.mx) * (p.my - a.my) - (b.my - a.my) * (p.mx - a.mx);
  };

  self.pointInTriangleMeters = function (p, a, b, c, tolerance) {
    var d1 = self.sideMeters(a, b, p);
    var d2 = self.sideMeters(b, c, p);
    var d3 = self.sideMeters(c, a, p);
    var scale = Math.max(self.distMeters(a, b), self.distMeters(b, c), self.distMeters(c, a), 1);
    var tol = (tolerance || 0) * scale;
    var hasNeg = d1 < -tol || d2 < -tol || d3 < -tol;
    var hasPos = d1 > tol || d2 > tol || d3 > tol;
    return !(hasNeg && hasPos);
  };

  self.isBetweenMeters = function (p, a, b) {
    var minX = Math.min(a.mx, b.mx) - self.settings.overlapMeters;
    var maxX = Math.max(a.mx, b.mx) + self.settings.overlapMeters;
    var minY = Math.min(a.my, b.my) - self.settings.overlapMeters;
    var maxY = Math.max(a.my, b.my) + self.settings.overlapMeters;
    return p.mx >= minX && p.mx <= maxX && p.my >= minY && p.my <= maxY;
  };

  self.escape = function (value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  };

  self.escapeAttr = function (value) {
    var n = Number(value);
    return isFinite(n) ? String(n) : '0';
  };

  var setup = self.setup;
  setup.info = pluginInfo;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description
  };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
