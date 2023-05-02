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
		async function toTelegram(){
			var url = new URL(request.url);
			const HOST_NAME = url.hostname;
			const option = url.pathname.split('/')[2];
			var data = await getPostData(request);
			url.hostname = "api.telegram.org";
			if(option.toUpperCase() == 'setWebhook'.toUpperCase()){
				if(data.get("url") != null){
					data.set("url", "https://"+HOST_NAME+"/webhook?url="+data.get("url"));
				}
				if(url.searchParams.get("url") != null){
					url.searchParams.set("url", "https://"+HOST_NAME+"/webhook?url="+url.searchParams.get("url"));
				}
			}
			var req_options = {
				method: request.method,
			}
			if(request.method.toUpperCase() == 'POST'){
				req_options['body'] = data;
			}
			var response = await fetch(url, req_options);
			if(option.toUpperCase() == 'getWebhookInfo'.toUpperCase()){
				response = await response.json()
				response['result']['url'] = response['result']['url'].replace("https://"+HOST_NAME+"/webhook?url=", '')
				response = JSON.stringify(response)
			}
			else{
				response = await response.text()
			}
			return new Response(response, {headers: { 'Content-Type': 'text/plain' }})
		}
		async function fromTelegram(){
			var url = new URL(request.url);
			var req_options = {
				method: request.method,
				body: await request.text(),
			}
			var response = await fetch(url.searchParams.get('url'), req_options);
			return new Response(await response.text(), {headers: { 'Content-Type': 'text/plain' }})
		}
		var url = new URL(request.url);
		if(/\/bot[a-zA-Z0-9:-_]*\/[a-zA-Z0-9]*/g.test(url.pathname)){
			return await toTelegram();
		}
		else if(/\/webhook/g.test(url.pathname) && url.searchParams.get('url') != null){
			return await fromTelegram();
		}
		else{
			return new Response('NOT FOUND', {headers: { 'Content-Type': 'text/plain' }})
		}
	}
}