"""Optional, offline Chromium session-race regression checks.

Requires Python Playwright and a Chromium binary. This does not contact any server.
Run: python tests/browser-session-smoke.py
Set GCB_CHROMIUM_PATH to the Chromium executable if Playwright lacks its own.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

PROJECT = Path(__file__).resolve().parent.parent
HTML = (PROJECT / 'public/index.html').read_text().replace(
    '<link rel="stylesheet" href="/styles.css"><script defer src="/app.js"></script>', '')
SCRIPT = (PROJECT / 'public/app.js').read_text()


def library(title):
    return {'schema': 1, 'bookmarks': [{
        'id': title, 'url': 'https://example.org/' + title, 'title': title,
        'description': '', 'notes': '', 'tags': [], 'collectionId': None,
        'status': 'unread', 'favorite': False, 'pinned': False, 'trashedAt': None,
        'createdAt': '2026-11-06T00:00:00.000Z', 'updatedAt': '2026-11-06T00:00:00.000Z'
    }], 'collections': []}


def submit_unlock(page, token):
    page.locator('#auth-token').fill(token)
    page.evaluate('document.querySelector("#unlock-form").dispatchEvent(new Event("submit", {bubbles:true,cancelable:true}))')


def main():
    with sync_playwright() as playwright:
        binary = os.getenv('GCB_CHROMIUM_PATH')
        kwargs = {'headless': True, 'args': ['--no-sandbox']}
        if binary:
            kwargs['executable_path'] = binary
        browser = playwright.chromium.launch(**kwargs)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 800})
            page.set_default_timeout(3000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_content(HTML)
            # about:blank disallows real Storage; substitute tab-local stores only in this
            # offline test harness, not in the application or live browser.
            page.evaluate('''() => {
              const makeStorage=()=>{const values=new Map();return {setItem:(k,v)=>values.set(k,String(v)),getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k)};};
              Object.defineProperty(window,'sessionStorage',{configurable:true,value:makeStorage()});
              Object.defineProperty(window,'localStorage',{configurable:true,value:makeStorage()});
              window._requests=[]; window._urls=0; window._revocations=[];
              window.fetch=(url,options={})=>{
                if(url==='/api/auth/revoke'){
                  window._revocations.push(options.headers?.Authorization);
                  return Promise.resolve({status:200,ok:true,json:async()=>({revoked:true})});
                }
                return new Promise(resolve=>window._requests.push({url,options,resolve}));
              };
              URL.createObjectURL=()=>{window._urls++;return 'blob:offline-test'};
              window.fulfill=(index,status,json)=>window._requests[index].resolve({
                status,ok:status>=200&&status<300,
                json:async()=>json,blob:async()=>new Blob([JSON.stringify(json)])});
            }''')
            old = 'gcb1_' + 'A'*43
            current = 'gcb1_' + 'C'*43
            stale = 'gcb1_' + 'D'*43
            final = 'gcb1_' + 'E'*43
            page.evaluate('(t)=>sessionStorage.setItem("gcb-session",t)', old)
            page.add_script_tag(content=SCRIPT)
            assert page.evaluate('window._requests.length') == 1
            assert page.evaluate('window._requests[0].url') == '/api/library'
            page.evaluate('document.querySelector("#lock-workspace").click()')
            submit_unlock(page, 'B'*32)
            assert page.evaluate('window._requests.length') == 2
            assert page.evaluate('window._requests[1].url') == '/api/auth/session'
            page.evaluate('(token)=>fulfill(1,201,{token,expiresAt:"2026-11-07T00:00:00Z"})', current)
            page.wait_for_function('window._requests.length === 3')
            assert page.evaluate('window._requests[2].url') == '/api/library'
            page.evaluate('(data)=>fulfill(2,200,data)', library('new_session'))
            page.wait_for_function('sessionStorage.getItem("gcb-session") === "' + current + '"')
            page.evaluate('(data)=>fulfill(0,401,data)', {'error': 'bad old token'})
            page.wait_for_timeout(40)
            assert not page.locator('#unlock-dialog').evaluate('(el)=>el.open')
            assert page.locator('.bookmark-card').count() == 1
            assert page.evaluate('sessionStorage.getItem("gcb-session")') == current
            # Export started while unlocked must not make a download if a lock occurs.
            page.evaluate('() => {void download("/api/export","private.json")}')
            assert page.evaluate('window._requests.length') == 4
            page.evaluate('lockWorkspace()')
            page.evaluate('(data)=>fulfill(3,200,data)', library('private_export'))
            page.wait_for_timeout(40)
            assert page.evaluate('window._urls') == 0
            # An issued session arriving after lock is immediately revoked/discarded.
            submit_unlock(page, 'P'*32)
            assert page.evaluate('window._requests.length') == 5
            page.evaluate('lockWorkspace()')
            page.evaluate('(token)=>fulfill(4,201,{token})', stale)
            page.wait_for_function('window._revocations.includes("Bearer ' + stale + '")')
            assert page.evaluate('window._requests.length') == 5
            assert page.locator('#unlock-dialog').evaluate('(el)=>el.open')
            assert page.locator('.bookmark-card').count() == 0
            assert page.evaluate('sessionStorage.getItem("gcb-session")') is None
            # Pending import preview may not prompt or submit after lock.
            submit_unlock(page, 'F'*32)
            assert page.evaluate('window._requests.length') == 6
            page.evaluate('(token)=>fulfill(5,201,{token})', final)
            page.wait_for_function('window._requests.length === 7')
            page.evaluate('(data)=>fulfill(6,200,data)', library('fresh_session'))
            page.wait_for_function('sessionStorage.getItem("gcb-session") === "' + final + '"')
            page.evaluate('''() => {
              window._confirmCalls=0;
              window.confirm=()=>{window._confirmCalls++;return true;};
              const file=new File([JSON.stringify({bookmarks:[{url:'https://example.org/import'}],collections:[]})], 'links.json', {type:'application/json'});
              void importFile(file);
            }''')
            page.wait_for_function('window._requests.length === 8')
            assert page.evaluate('window._requests[7].url') == '/api/import/full/preview'
            page.evaluate('lockWorkspace()')
            page.evaluate('(data)=>fulfill(7,200,data)', {'imported':1,'skipped':0,'collectionsCreated':0,'revision':'a'*64})
            page.wait_for_timeout(40)
            assert page.evaluate('window._confirmCalls') == 0
            assert page.evaluate('window._requests.length') == 8
            assert page.evaluate('sessionStorage.getItem("gcb-session")') is None
            assert page.evaluate('window._revocations.includes("Bearer ' + current + '")')
            assert page.evaluate('window._revocations.includes("Bearer ' + final + '")')
            assert not errors, errors
            print('PASS: stale 401, locked export, late session issue, locked import preview and best-effort revoke; no JS errors')
        finally:
            browser.close()


if __name__ == '__main__':
    main()
