$user = App\Models\User::find(21);
auth()->login($user);
$request = Illuminate\Http\Request::create('/api/v1/subscription/usage', 'GET');
$request->setUserResolver(fn () => $user);
$response = app()->handle($request);
dump($response->getStatusCode());
dump($response->getContent());
