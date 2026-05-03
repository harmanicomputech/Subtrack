import 'package:freezed_annotation/freezed_annotation.dart';

part 'subscription.freezed.dart';
part 'subscription.g.dart';

@freezed
class Subscription with _$Subscription {
  const factory Subscription({
    required int id,
    required int userId,
    required String merchantName,
    required double amount,
    required String currency,
    required String billingCycle,
    String? nextRenewalDate,
    String? category,
    required String status,
    required double confidenceScore,
    int? bankConnectionId,
    required String createdAt,
    required String updatedAt,
  }) = _Subscription;

  factory Subscription.fromJson(Map<String, dynamic> json) =>
      _$SubscriptionFromJson(json);
}
