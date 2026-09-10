<?php

namespace Tests\Feature;

use App\Modelos\{Aeronave, AsignacionSobrecargo, ChecklistItem, LineaTiempoOperacion, Operacion, Proveedor, SolicitudVuelo, Usuario};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Log, Storage};
use Tests\TestCase;

class PostflightIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(string $status = 'postflight_pending'): Operacion
    {
        Storage::fake('s3');
        config(['filesystems.disks.s3.key' => 'audit', 'filesystems.disks.s3.secret' => 'audit',
            'filesystems.disks.s3.bucket' => 'audit', 'filesystems.disks.s3.region' => 'us-east-1']);
        $this->seed();
        $crew = Usuario::where('email', 'sobrecargo@redaviation.test')->firstOrFail();
        $provider = Proveedor::firstOrFail();
        $flight = SolicitudVuelo::create([
            'client_id' => Usuario::where('email', 'cliente@privateflights.test')->value('id'),
            'origin' => 'MMMX', 'destination' => 'MMUN', 'departure_datetime' => now()->addDay(),
            'passengers' => 3, 'trip_type' => 'one_way', 'status' => 'confirmada', 'workflow_status' => 'flight_confirmed',
        ]);
        $op = Operacion::create([
            'flight_request_id' => $flight->id, 'provider_id' => $provider->id,
            'aircraft_id' => Aeronave::where('provider_id', $provider->id)->value('id'),
            'sobrecargo_user_id' => $crew->id, 'status' => 'confirmed', 'crew_status' => $status,
            'crew_checkin_at' => now(),
        ]);
        AsignacionSobrecargo::create(['operation_id' => $op->id, 'sobrecargo_user_id' => $crew->id,
            'status' => 'confirmed', 'assigned_at' => now(), 'accepted_at' => now()]);
        foreach (['cabina_lista', 'pasajeros_recibidos', 'in_flight', 'landed', 'postflight_pending'] as $state) {
            LineaTiempoOperacion::create(['operation_id' => $op->id, 'status' => $state, 'title' => 'Test']);
        }
        $token = $this->postJson('/api/v1/auth/login', ['email' => $crew->email, 'password' => 'password'])->assertOk()->json('token');
        $this->withToken($token);
        $this->getJson($this->base($op).'/workflow')->assertOk();
        foreach ($op->checklists()->whereIn('type', ['preparation', 'preflight'])->get() as $group) {
            $group->items()->update(['status' => 'completed', 'is_completed' => true]);
        }
        return $op;
    }

    private function base(Operacion $op): string { return "/api/v1/sobrecargo/operations/{$op->id}"; }

    private function item(Operacion $op, string $type, string $code): ChecklistItem
    {
        return $op->checklists()->where('type', $type)->firstOrFail()->items()->where('code', $code)->firstOrFail();
    }

    private function upload(Operacion $op, string $type, string $code, string $name = 'photo.jpg')
    {
        $item = $this->item($op, $type, $code);
        return $this->post($this->base($op)."/checklists/$type/items/{$item->id}/evidence",
            ['file' => UploadedFile::fake()->image($name)], ['Accept' => 'application/json']);
    }

    private function twoPhotos(Operacion $op): void
    {
        $this->upload($op, 'preflight', 'catering_received')->assertCreated();
        $this->upload($op, 'preflight', 'baggage_secured')->assertCreated();
    }

    public function test_integrated_uploads_are_identical_in_mobile_and_admin_and_isolated(): void
    {
        $op = $this->fixture();
        $crewToken = $this->postJson('/api/v1/auth/login', ['email' => 'sobrecargo@redaviation.test', 'password' => 'password'])->assertOk()->json('token');
        $adminToken = $this->postJson('/api/v1/auth/login', ['email' => 'admin@privateflights.test', 'password' => 'password'])->assertOk()->json('token');
        Storage::disk('s3')->buildTemporaryUrlsUsing(fn ($path, $expiration) => 'http://127.0.0.1:4178/media/'.basename($path).'?expires='.$expiration->getTimestamp());
        $directory = '/private/tmp/postflight-fixture';
        if (!is_dir($directory)) mkdir($directory, 0700, true);
        $snapshots = [];
        $slots = [['preflight', 'catering_received'], ['preflight', 'baggage_secured'], ['postflight', 'cabin_condition']];
        for ($count = 0; $count <= 3; $count++) {
            $this->withToken($crewToken);
            if ($count) {
                [$type, $code] = $slots[$count - 1];
                $this->upload($op, $type, $code, $code.'.png')->assertCreated();
            }
            $mobile = $this->getJson($this->base($op).'/workflow')->assertOk()->json();
            $this->getJson('/api/v1/admin/crew/operations/'.$op->id.'/workflow')->assertForbidden();
            $this->withToken($adminToken);
            $admin = $this->getJson('/api/v1/admin/crew/operations/'.$op->id.'/workflow')->assertOk()->json();
            $this->assertSame($mobile['operation_id'], $admin['operation_id']);
            $this->assertSame($mobile['checklists'], $admin['checklists']);
            $files = collect($mobile['checklists'])->flatMap(fn ($g) => $g['items'])->flatMap(fn ($i) => $i['evidence_files']);
            $this->assertCount($count, $files);
            foreach ($files as $file) {
                Storage::disk('s3')->assertExists($file['file_path']);
                file_put_contents($directory.'/'.basename($file['file_path']), Storage::disk('s3')->get($file['file_path']));
                $this->assertNotEmpty($file['file_url']);
            }
            $snapshots[] = ['mobile' => $mobile, 'admin' => $admin];
        }
        $other = $op->replicate(); $other->save();
        AsignacionSobrecargo::create(['operation_id'=>$other->id, 'sobrecargo_user_id'=>$op->sobrecargo_user_id, 'status'=>'confirmed', 'assigned_at'=>now(), 'accepted_at'=>now()]);
        $otherAdmin = $this->getJson('/api/v1/admin/crew/operations/'.$other->id.'/workflow')->assertOk()->json();
        $this->assertSame([], $otherAdmin['checklists']);
        $this->withToken($crewToken);
        $otherMobile = $this->getJson($this->base($other).'/workflow')->assertOk()->json();
        $this->assertCount(0, collect($otherMobile['checklists'])->flatMap(fn ($g) => $g['items'])->flatMap(fn ($i) => $i['evidence_files']));
        file_put_contents($directory.'/workflow.json', json_encode(['snapshots'=>$snapshots, 'other'=>$otherAdmin], JSON_PRETTY_PRINT));
    }
}
