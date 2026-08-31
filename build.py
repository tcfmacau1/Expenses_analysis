#!/usr/bin/env python3
"""把 core.js 與 app.js 注入 index.html，並蓋上版本戳。
版本戳同步寫進 index.html（window.__BUILD、資源 ?v=）與 sw.js（CACHE 名稱），
確保每次組建的 service worker 快取都是新的，手機不會抱著舊版不放。"""
import datetime, pathlib, re, sys

root = pathlib.Path(__file__).parent
BUILD = datetime.datetime.now().strftime('%Y%m%d-%H%M')

html = (root / 'index.html').read_text()

for name, begin, end in [
    ('core.js', '/* ==CORE:BEGIN== 由 build.py 自 core.js 注入，請勿手改此區塊 */', '/* ==CORE:END== */'),
    ('app.js',  '/* ==APP:BEGIN== 由 build.py 自 app.js 注入，請勿手改此區塊 */',  '/* ==APP:END== */'),
]:
    src = (root / name).read_text()
    if '</script' in src:
        sys.exit(f'{name} 含有 </script，無法安全內嵌')
    pattern = re.compile(re.escape(begin) + r'.*?' + re.escape(end), re.S)
    if not pattern.search(html):
        sys.exit(f'index.html 找不到 {name} 的注入標記')
    html = pattern.sub(lambda m: begin + '\n' + src + '\n' + end, html)
    print(f'已注入 {name}（{len(src):,} 字元）')

# 版本戳
html, n1 = re.subn(r"window\.__BUILD='[^']*'", f"window.__BUILD='{BUILD}'", html)
html, n2 = re.subn(r'(manifest\.webmanifest|icon-192\.png)\?v=[^"]*', rf'\1?v={BUILD}', html)
if not n1:
    sys.exit('index.html 找不到 window.__BUILD，無法蓋版本戳')
(root / 'index.html').write_text(html)

sw = (root / 'sw.js').read_text()
sw, n3 = re.subn(r"const BUILD = '[^']*';", f"const BUILD = '{BUILD}';", sw)
if not n3:
    sys.exit('sw.js 找不到 BUILD 常數')
(root / 'sw.js').write_text(sw)

print(f'版本戳 {BUILD}（index.html {n1+n2} 處、sw.js {n3} 處）')
print(f'index.html 共 {len(html):,} 字元，外部相依 0')
