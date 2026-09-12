<?php
use App\Modelos\{Usuario,Proveedor,Aeronave,SolicitudVuelo,TokenApi,Operacion};
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;
$app=require '/Users/redaviation/Documents/SKYGRUP/UBERAVIONES/BACKEND UBER AVIONES/scripts/concurrency/bootstrap.php';
if (($argv[1]??'')==='worker') {
 [,,$id,$token,$file]=$argv;
 file_put_contents($file.'.ready',(string) DB::selectOne('select pg_backend_pid() pid')->pid);
 $request=Request::create('/api/v1/operator/requests/'.$id.'/accept','POST',[],[],[],['HTTP_AUTHORIZATION'=>'Bearer '.$token,'HTTP_ACCEPT'=>'application/json','CONTENT_TYPE'=>'application/json'],'{}');
 $kernel=$app->make(Illuminate\Contracts\Http\Kernel::class);$response=$kernel->handle($request);$kernel->terminate($request,$response);
 $body=json_decode($response->getContent(),true);
 file_put_contents($file.'.json',json_encode(['pid'=>getmypid(),'status'=>$response->getStatusCode(),'operation_id'=>$body['operation']['id']??null,'error'=>$response->getStatusCode()>=400?$body:null]));exit;
}
$summaries=[];
foreach (['same-provider','two-providers'] as $scenario) {
 $client=Usuario::factory()->create(['role'=>'client','status'=>'active']);$actors=[];$providers=[];$aircraft=[];$tokens=[];
 for($i=0;$i<2;$i++) {
  $actors[$i]=Usuario::factory()->create(['role'=>'provider','status'=>'active']);
  $providers[$i]=Proveedor::create(['user_id'=>$actors[$i]->id,'company_name'=>'Concurrency','commercial_name'=>'Concurrency','approval_status'=>'approved','admin_validation_status'=>'approved','access_enabled'=>true]);
  $actors[$i]->update(['provider_id'=>$providers[$i]->id]);
  $aircraft[$i]=Aeronave::create(['provider_id'=>$providers[$i]->id,'model'=>'Test','registration'=>'T-'.bin2hex(random_bytes(4)),'capacity'=>6,'base_airport'=>'MMMX','range_km'=>2500,'speed_kmh'=>700,'hourly_rate'=>5000,'currency'=>'USD','status'=>'active']);
  $tokens[$i]=TokenApi::issue($actors[$i]);
 }
 $flight=SolicitudVuelo::create(['client_id'=>$client->id,'origin'=>'MMMX','destination'=>'MMTO','departure_datetime'=>now()->addDays(5),'passengers'=>2,'trip_type'=>'one_way','status'=>'pending']);
 foreach($providers as $i=>$provider)$flight->matches()->create(['provider_id'=>$provider->id,'aircraft_id'=>$aircraft[$i]->id,'status'=>'pending']);
 $dir=sys_get_temp_dir().'/accept-'.bin2hex(random_bytes(5));mkdir($dir);$processes=[];
 $launch=function($label,$token)use($flight,$dir){$file=$dir.'/'.$label;$h=proc_open([PHP_BINARY,__FILE__,'worker',(string)$flight->id,$token,$file],[1=>['file',$file.'.out','w'],2=>['file',$file.'.err','w']],$pipes);return ['handle'=>$h,'file'=>$file];};
 DB::beginTransaction();DB::table('flight_requests')->where('id',$flight->id)->lockForUpdate()->first();
 $overlap=[];
 try {
  $processes[]=$launch('a',$tokens[0]);$processes[]=$launch('b',$tokens[$scenario==='same-provider'?0:1]);$deadline=microtime(true)+12;
  do {$pids=[];foreach($processes as $p)if(is_file($p['file'].'.ready'))$pids[]=(int)file_get_contents($p['file'].'.ready');if(count($pids)===2){$overlap=DB::select("select pid,wait_event_type,pg_blocking_pids(pid) blockers from pg_stat_activity where pid in (?,?) and wait_event_type='Lock'",$pids);if(count($overlap)===2)break;}usleep(20000);}while(microtime(true)<$deadline);
 }finally{DB::rollBack();}
 $finish=function($p){$code=proc_close($p['handle']);if($code!==0||!is_file($p['file'].'.json'))throw new RuntimeException('Worker failed '.$p['file']);return json_decode(file_get_contents($p['file'].'.json'),true);};
 $responses=array_map($finish,$processes);$operation=Operacion::where('flight_request_id',$flight->id)->first();$winner=$operation?->provider_id===$providers[0]->id?0:1;$retry=$finish($launch('retry',$tokens[$winner]));
 $statuses=array_column($responses,'status');sort($statuses);$expected=$scenario==='same-provider'?[200,200]:[200,409];
 $count=Operacion::where('flight_request_id',$flight->id)->count();$timeline=$operation?->timeline()->count();
 $ok=count($overlap)===2&&$statuses===$expected&&$count===1&&$timeline===1&&$retry['status']===200&&$retry['operation_id']===$operation->id;
 $summaries[]=['scenario'=>$scenario,'database'=>DB::getDatabaseName(),'environment'=>app()->environment(),'overlap'=>$overlap,'responses'=>$responses,'retry'=>$retry,'operations'=>$count,'timeline'=>$timeline,'passed'=>$ok,'artifacts'=>$dir];
}
echo json_encode($summaries,JSON_PRETTY_PRINT),PHP_EOL;exit(count(array_filter($summaries,fn($s)=>!$s['passed']))?1:0);
