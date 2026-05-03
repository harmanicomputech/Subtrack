import 'package:freezed_annotation/freezed_annotation.dart';

part 'dashboard_summary.freezed.dart';
part 'dashboard_summary.g.dart';

@freezed
class DashboardSummary with _$DashboardSummary {
  const factory DashboardSummary({
    required double totalMonthlySpend,
    required double totalYearlySpend,
    required int activeSubscriptions,
    required int cancelledSubscriptions,
    required double totalSaved,
    required int upcomingRenewalsCount,
    required int unreadNotifications,
  }) = _DashboardSummary;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) =>
      _$DashboardSummaryFromJson(json);
}
