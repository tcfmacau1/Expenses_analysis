#!/usr/bin/env python3
"""把 core.js 與 app.js 注入 index.html，產生零外部相依的單檔版本。改完任一個就跑一次。"""
import pathlib, re, sys

root = pathlib.Path(__file__).parent
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

(root / 'index.html').write_text(html)
print(f'index.html 共 {len(html):,} 字元，外部相依 0')
