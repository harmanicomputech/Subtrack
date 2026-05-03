import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Lock, CreditCard, ShieldCheck } from "lucide-react";

function formatCardNumber(val: string): string {
  return val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
  return digits;
}

export default function BillingDemoCheckout() {
  const [, setLocation] = useLocation();

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState(0);

  const token = localStorage.getItem("recuris_token");

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const digits = cardNumber.replace(/\s/g, "");
    if (digits.length < 16) { setError("Please enter a valid 16-digit card number."); return; }
    const expiryDigits = expiry.replace(/\s\/\s|\//g, "");
    if (expiryDigits.length < 4) { setError("Please enter a valid expiry date."); return; }
    if (cvc.length < 3) { setError("Please enter a valid CVC."); return; }
    if (!cardholderName.trim()) { setError("Please enter the cardholder name."); return; }

    setLoading(true);

    // Simulate processing stages
    setProcessingStep(1);
    await new Promise(r => setTimeout(r, 600));
    setProcessingStep(2);
    await new Promise(r => setTimeout(r, 700));
    setProcessingStep(3);

    try {
      const res = await fetch("/api/billing/demo-confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError("Payment could not be processed. Please try again.");
        setLoading(false);
        setProcessingStep(0);
        return;
      }

      // Mark as subscribed locally, then redirect to success
      localStorage.setItem("recuris_subscribed", "1");
      await new Promise(r => setTimeout(r, 400));
      setLocation("/billing/success");
    } catch {
      setError("Network error. Please check your connection.");
      setLoading(false);
      setProcessingStep(0);
    }
  };

  const processingLabel = [
    "",
    "Verifying card details…",
    "Contacting your bank…",
    "Confirming payment…",
  ][processingStep] ?? "";

  return (
    <div className="min-h-screen bg-[#f6f9fc] flex items-center justify-center p-4">
      <div className="w-full max-w-[440px]">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

          {/* Header stripe */}
          <div className="bg-[#635bff] px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/80 text-xs font-medium uppercase tracking-wider mb-0.5">Recuris Pro</p>
                <div className="text-white text-2xl font-bold">£4.00</div>
                <p className="text-white/70 text-xs mt-0.5">per month · Cancel anytime</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handlePay} className="px-6 py-6 space-y-4">

            {/* Card number */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Card number
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="1234 5678 9012 3456"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#635bff]/40 focus:border-[#635bff] transition-colors pr-10"
                  disabled={loading}
                  autoComplete="cc-number"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  <div className="text-[8px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-tight">VISA</div>
                </div>
              </div>
            </div>

            {/* Expiry + CVC */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Expiry date
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiry}
                  onChange={e => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM / YY"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#635bff]/40 focus:border-[#635bff] transition-colors"
                  disabled={loading}
                  autoComplete="cc-exp"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  CVC
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cvc}
                  onChange={e => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="123"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#635bff]/40 focus:border-[#635bff] transition-colors"
                  disabled={loading}
                  autoComplete="cc-csc"
                />
              </div>
            </div>

            {/* Cardholder name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Cardholder name
              </label>
              <input
                type="text"
                value={cardholderName}
                onChange={e => setCardholderName(e.target.value)}
                placeholder="Full name on card"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#635bff]/40 focus:border-[#635bff] transition-colors"
                disabled={loading}
                autoComplete="cc-name"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Processing status */}
            {loading && processingStep > 0 && (
              <div className="flex items-center gap-2 text-xs text-[#635bff] bg-[#635bff]/5 border border-[#635bff]/20 rounded-lg px-3 py-2">
                <div className="h-3 w-3 border-2 border-[#635bff] border-t-transparent rounded-full animate-spin shrink-0" />
                {processingLabel}
              </div>
            )}

            {/* Pay button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#635bff] hover:bg-[#5851e6] disabled:opacity-70 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              <Lock className="h-3.5 w-3.5" />
              {loading ? processingLabel || "Processing…" : "Pay £4.00"}
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={() => setLocation("/dashboard")}
              disabled={loading}
              className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 disabled:opacity-40"
            >
              Cancel and return to dashboard
            </button>
          </form>
        </div>

        {/* Stripe branding */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-xs text-gray-400">
            Secured by <span className="font-semibold text-gray-500">Stripe</span> · 256-bit SSL encryption
          </p>
        </div>
      </div>
    </div>
  );
}
