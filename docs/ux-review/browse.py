#!/usr/bin/env python3
"""Headless browser helper for the review agents.

usage: browse.py URL OUT.png [--desktop] [--full] [--dark]
                 [--do 'click:CSS' --do 'fill:CSS=text' --do 'press:Key' --do 'wait:MS' --do 'goto:URL' --do 'scroll:PX' ...]
                 [--text]   # also print visible page text
                 [--storage KEY=VALUE ...]  # localStorage before load
Prints console errors, failed requests, final URL, page title. Cookies/localStorage persist in ./pw-state.json (use --fresh to reset).
"""
import sys, json, os, argparse, asyncio
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument("url"); ap.add_argument("out")
ap.add_argument("--desktop", action="store_true"); ap.add_argument("--full", action="store_true")
ap.add_argument("--dark", action="store_true"); ap.add_argument("--text", action="store_true")
ap.add_argument("--fresh", action="store_true"); ap.add_argument("--slow3g", action="store_true")
ap.add_argument("--do", action="append", default=[]); ap.add_argument("--storage", action="append", default=[])
ap.add_argument("--state", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "pw-state.json"))
a = ap.parse_args()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        kw = dict(viewport={"width":1280,"height":800} if a.desktop else {"width":390,"height":844},
                  device_scale_factor=2, is_mobile=not a.desktop, has_touch=not a.desktop,
                  locale="el-GR", timezone_id="Europe/Athens",
                  color_scheme="dark" if a.dark else "light")
        if not a.fresh and os.path.exists(a.state): kw["storage_state"] = a.state
        ctx = await b.new_context(**kw)
        page = await ctx.new_page()
        errs, failed = [], []
        page.on("console", lambda m: errs.append(m.text) if m.type in ("error","warning") else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        page.on("requestfailed", lambda r: failed.append(f"FAILED {r.failure} {r.url}") if r.failure and "ERR_ABORTED" not in r.failure else None)
        page.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        if a.storage:
            await page.goto(a.url.split("/",3)[0] + "//" + a.url.split("/",3)[2] + "/", wait_until="domcontentloaded")
            for kv in a.storage:
                k, v = kv.split("=",1); await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [k,v])
        if a.slow3g:
            cdp = await ctx.new_cdp_session(page)
            await cdp.send("Network.emulateNetworkConditions", {"offline":False,"latency":400,"downloadThroughput":50000,"uploadThroughput":20000})
        await page.goto(a.url, wait_until="networkidle")
        for step in a.do:
            op, _, arg = step.partition(":")
            try:
                if op == "click": await page.locator(arg).first.click(timeout=5000)
                elif op == "fill":
                    sel, _, txt = arg.partition("="); await page.locator(sel).first.fill(txt, timeout=5000)
                elif op == "press": await page.keyboard.press(arg)
                elif op == "wait": await page.wait_for_timeout(int(arg))
                elif op == "goto": await page.goto(arg, wait_until="networkidle")
                elif op == "scroll": await page.mouse.wheel(0, int(arg))
                elif op == "eval": print("EVAL:", await page.evaluate(arg))
                await page.wait_for_timeout(400)
            except Exception as e:
                print(f"STEP FAILED [{step}]: {str(e).splitlines()[0]}")
        await page.wait_for_timeout(500)
        await page.screenshot(path=a.out, full_page=a.full)
        print("URL:", page.url); print("TITLE:", await page.title())
        if a.text: print("TEXT:\n" + await page.evaluate("document.body.innerText"))
        if errs: print("CONSOLE:", *errs[:15], sep="\n  ")
        if failed: print("FAILED/4xx+:", *failed[:15], sep="\n  ")
        await ctx.storage_state(path=a.state)
        await b.close()
asyncio.run(main())
