/**
 * Shared helper to extract Pine Script study/strategy from chart.
 * Eliminates duplicate code across data.js and other modules.
 */

/**
 * Find a strategy or study on the chart by type and optional name filter.
 * @param {string} targetType - 'strategy' or 'study'
 * @param {string} [nameFilter] - Optional substring to match in study name
 * @returns {Promise<{found: boolean, entity?: any, error?: string}>}
 */
export async function findStudyOnChart(targetType, nameFilter = '') {
  const isStrategy = targetType === 'strategy';
  
  const result = await evaluate(`
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
        var sources = chart.model().model().dataSources();
        var target = null;
        var filter = ${JSON.stringify(nameFilter)};
        
        for (var i = 0; i < sources.length; i++) {
          var s = sources[i];
          if (!s.metaInfo) continue;
          
          var meta = s.metaInfo();
          var isPriceStudy = meta.is_price_study !== false;
          var hasReportOrPerf = !!(s.reportData || s.performance);
          
          // Strategy detection: not a price study AND has report/performance data
          if (${isStrategy}) {
            if (!isPriceStudy && hasReportOrPerf) {
              if (!filter) { target = s; break; }
              var name = meta.description || meta.shortDescription || '';
              if (name.indexOf(filter) !== -1) { target = s; break; }
            }
          }
          // Study detection: has metaInfo and description
          else {
            var name = meta.description || meta.shortDescription || '';
            if (!name) continue;
            if (filter && name.indexOf(filter) === -1) continue;
            target = s;
            if (!filter) break; // First match if no filter
          }
        }
        
        if (!target) return { found: false, error: '${isStrategy ? 'No strategy' : 'No study'} found${nameFilter ? ' matching "' + nameFilter + '"' : ''}' };
        return { found: true, entity_id: target.id };
      } catch(e) {
        return { found: false, error: e.message };
      }
    })()
  `);
  
  return result;
}

/**
 * Build graphics JS for Pine Script elements (lines, labels, boxes, tables).
 * This is a shared template used by getPineLines, getPineLabels, etc.
 * @param {string} collectionName - e.g., 'dwglines', 'dwglabels'
 * @param {string} mapKey - e.g., 'lines', 'labels'
 * @param {string} [filter] - Optional study name filter
 * @returns {string} JavaScript code string for evaluate()
 */
export function buildGraphicsJS(collectionName, mapKey, filter = '') {
  return `
    (function() {
      var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var results = [];
      var filter = ${JSON.stringify(filter || '')};
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si];
        if (!s.metaInfo) continue;
        try {
          var meta = s.metaInfo();
          var name = meta.description || meta.shortDescription || '';
          if (!name) continue;
          if (filter && name.indexOf(filter) === -1) continue;
          var g = s._graphics;
          if (!g || !g._primitivesCollection) continue;
          var pc = g._primitivesCollection;
          var items = [];
          try {
            var outer = pc.${collectionName};
            if (outer) {
              var inner = outer.get('${mapKey}');
              if (inner) {
                var coll = inner.get(false);
                if (coll && coll._primitivesDataById && coll._primitivesDataById.size > 0) {
                  coll._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              }
            }
          } catch(e) {}
          if (items.length === 0 && '${collectionName}' === 'dwgtablecells') {
            try {
              var tcOuter = pc.dwgtablecells;
              if (tcOuter) {
                var tcColl = tcOuter.get('tableCells');
                if (tcColl && tcColl._primitivesDataById && tcColl._primitivesDataById.size > 0) {
                  tcColl._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              }
            } catch(e) {}
          }
          if (items.length > 0) results.push({name: name, count: items.length, items: items});
        } catch(e) {}
      }
      return results;
    })()
  `;
}

/**
 * Extract strategy data source from chart with retry logic.
 * Used by getStrategyResults, getTrades, getEquity.
 * @returns {Promise<{found: boolean, path?: string, error?: string}>}
 */
export async function findStrategyDataSource() {
  return evaluate(`
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget;
        var sources = chart.model().model().dataSources();
        for (var i = 0; i < sources.length; i++) {
          var s = sources[i];
          if (s.metaInfo && s.metaInfo().is_price_study === false && (s.reportData || s.performance)) {
            return { found: true, id: s.id };
          }
        }
        return { found: false, error: 'No strategy found on chart. Add a strategy indicator first.' };
      } catch(e) {
        return { found: false, error: e.message };
      }
    })()
  `);
}
