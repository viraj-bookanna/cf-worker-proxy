import aiohttp,json
from aiohttp import web

async def handler(request):
    async def fetch(reqdata):
        reqdata["options"] = reqdata.get("options", {})
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.request(
                reqdata["options"].get("method", 'GET'),
                reqdata["url"],
                headers=reqdata["options"].get("headers", {}),
                data=reqdata["options"].get("body", ''),
                proxy='http://127.0.0.1:8080'
            ) as response:
                res_headers = dict(response.headers)
                passed_headers = ["Content-Length", "Content-Type"]
                headers = {}
                for h in passed_headers:
                    if h in res_headers:
                        headers[h] = res_headers[h]
                if "unblock_cors" in request.query:
                    headers['Access-Control-Allow-Origin'] = '*'
                out_response = web.StreamResponse(status=response.status, headers=headers)
                await out_response.prepare(request)
                async for chunk in response.content.iter_chunked(1024):
                    await out_response.write(chunk)
                await out_response.write_eof()
                return out_response
    try:
        if request.method == 'GET':
            reqdata = json.loads(request.query["reqdata"])
        elif request.method == 'POST' and request.headers.get('content-type') == 'application/json':
            reqdata = await request.json()
        elif request.method == 'POST':
            reqdata = json.loads((await request.post())["reqdata"])
        else:
            return web.Response(text='Invalid Request')
        return await fetch(reqdata)
    except Exception as e:
        return web.Response(text=repr(e))

app = web.Application()
app.router.add_get('/', handler)
app.router.add_post('/', handler)
web.run_app(app, port=12522)
