import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class AuthState {
  final String? token;
  final Map<String, dynamic>? user;
  AuthState({this.token, this.user});
  AuthState copyWith({String? token, Map<String, dynamic>? user}) =>
      AuthState(token: token ?? this.token, user: user ?? this.user);
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;

  AuthNotifier(this._api) : super(AuthState()) {
    _loadToken();
  }

  Future<void> _loadToken() async {
    final token = await _api.getToken();
    if (token != null) {
      state = state.copyWith(token: token);
    }
  }

  Future<void> login(String email, String password) async {
    final response = await _api.post('/auth/login', data: {'email': email, 'password': password});
    final token = response.data['token'] as String;
    await _api.saveToken(token);
    state = AuthState(token: token, user: response.data['user'] as Map<String, dynamic>);
  }

  Future<void> register(String email, String password, String name) async {
    final response = await _api.post('/auth/register', data: {'email': email, 'password': password, 'name': name});
    final token = response.data['token'] as String;
    await _api.saveToken(token);
    state = AuthState(token: token, user: response.data['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    await _api.post('/auth/logout');
    await _api.clearToken();
    state = AuthState();
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(apiClientProvider));
});
