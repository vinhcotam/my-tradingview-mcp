/**
 * Core alert logic.
 */
import { evaluate, evaluateAsync, getClient, safeString } from '../connection.js';

export async function create({ condition, price, message }) {
  const opened = await evaluate(`
    (function() {
      var btn = document.querySelector('[aria-label="Create alert"]')
        || document.querySelector('button[aria-label="Create alert"]')
        || Array.from(document.querySelectorAll('button,[role="button"]')).find(function(el) {
          if (el.offsetParent === null) return false;
          var text = (el.textContent || '').trim();
          var aria = el.getAttribute('aria-label') || '';
          return text === 'Alert' || /create alert/i.test(aria);
        });
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);

  if (!opened) {
    const client = await getClient();
    await client.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 1, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA' });
  }

  await new Promise(r => setTimeout(r, 1000));

  const normalizedCondition = String(condition || 'crossing').toLowerCase();
  const conditionSet = await evaluate(`
    (function() {
      var target = ${safeString(normalizedCondition)};
      if (!target || target === 'crossing') return true;
      var trigger = Array.from(document.querySelectorAll('button,[role="button"]')).find(function(el) {
        if (el.offsetParent === null) return false;
        var text = (el.textContent || '').trim();
        return /cross|greater|less/i.test(text);
      });
      if (!trigger) return false;
      trigger.click();
      var desired = target.replace(/_/g, ' ');
      var items = Array.from(document.querySelectorAll('[role="menuitem"], button, [class*="item"]')).filter(function(el) {
        return el.offsetParent !== null;
      });
      var match = items.find(function(el) {
        var text = (el.textContent || '').trim().toLowerCase();
        return text === desired || text.indexOf(desired) !== -1;
      });
      if (!match) return false;
      match.click();
      return true;
    })()
  `);

  const priceSet = await evaluate(`
    (function() {
      function rowText(el) {
        var node = el;
        for (var i = 0; i < 5 && node; i++, node = node.parentElement) {
          var text = (node.textContent || '').trim();
          if (text) return text;
        }
        return '';
      }

      var inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).filter(function(el) {
        return el.offsetParent !== null;
      });
      var target = inputs.find(function(el) { return /value|price/i.test(rowText(el)); }) || inputs[0];
      if (target) {
        var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeSet.call(target, ${safeString(String(price))});
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        return true;
      }
      return false;
    })()
  `);

  if (message) {
    await evaluate(`
      (function() {
        var textarea = Array.from(document.querySelectorAll('textarea')).find(function(el) {
          if (el.offsetParent === null) return false;
          var aria = el.getAttribute('aria-label') || '';
          var placeholder = el.getAttribute('placeholder') || '';
          return !/editor content/i.test(aria) && /message/i.test(aria + ' ' + placeholder + ' ' + (el.closest('[class*="row"], [class*="field"]')?.textContent || ''));
        });
        if (textarea) {
          var nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          nativeSet.call(textarea, ${JSON.stringify(message)});
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
  }

  await new Promise(r => setTimeout(r, 500));
  const created = await evaluate(`
    (function() {
      var btns = Array.from(document.querySelectorAll('button[data-name="submit"], button,[role="button"]')).filter(function(el) {
        return el.offsetParent !== null;
      });
      for (var i = 0; i < btns.length; i++) {
        if (/^create$/i.test(btns[i].textContent.trim())) { btns[i].click(); return true; }
      }
      return false;
    })()
  `);

  return {
    success: !!created,
    price,
    condition,
    message: message || '(none)',
    condition_set: !!conditionSet,
    price_set: !!priceSet,
    source: 'dom_fallback',
  };
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all }) {
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }
  throw new Error('Individual alert deletion not yet supported. Use delete_all: true.');
}
