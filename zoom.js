export default{
	async fetch(request, env){
		async function getPostData(request){
			try{
				return await request.formData();
			}
			catch(e){
				return new FormData();
			}
		}
		if(request.method.toUpperCase() == 'OPTIONS'){
			return new Response('', {headers: { 'Access-Control-Allow-Origin': '*' }});
		}
		try{
			var reqdata,
				pattern = /fetch\("([^"]+)", (\{.+})\);/s,
				url = new URL(request.url),
				data = await getPostData(request);
			if(url.searchParams.get("reqdata") != null || data.get("reqdata") != null){
				reqdata = JSON.parse(url.searchParams.get("reqdata") ?? data.get("reqdata"));
				var resp = fetch(reqdata['url'], reqdata['options']);
				if(url.searchParams.get("unblock_cors") != null){
					resp = await resp;
					resp = new Response(resp.body, resp);
					resp.headers.set('Access-Control-Allow-Origin', '*');
				}
				return resp;
			}
			else if(data.get("fetchdata") == null || !pattern.test(data.get("fetchdata"))){
				var form = `
	<form method="post">
		<textarea name="fetchdata"></textarea><br>
		<input type="submit" value="do request"></input>
	</form>
	`;
				return new Response(form, {headers: { 'Content-Type': 'text/html' }});
			}
			var m = data.get("fetchdata").match(pattern);
			reqdata = {
				url: m[1],
				options: JSON.parse(m[2])
			};
			var link = 'https://'+url.hostname+'/?reqdata='+encodeURIComponent(JSON.stringify(reqdata));
			return new Response(`<a href="${link}" target="_blank">REQUEST LINK</a>`, {headers: { 'Content-Type': 'text/html' }});
		}
		catch(e){
			return new Response(e.toString(), {headers: { 'Content-Type': 'text/html' }});
		}
	}
}