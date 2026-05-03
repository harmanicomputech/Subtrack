import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ShieldCheck, Zap, Database, Lock, ChevronRight, Layers } from "lucide-react";
import { SiNetflix, SiSpotify, SiDropbox } from "react-icons/si";

export default function Home() {
  const { scrollYProgress } = useScroll();
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary selection:text-primary-foreground">
      <Navbar />
      <main>
        <Hero yBg={yBg} />
        <SocialProof />
        <Problem />
        <Features />
        <HowItWorks />
        <Testimonial />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      className={`fixed top-0 w-full z-50 transition-all duration-300 border-b border-transparent ${
        scrolled ? "bg-background/80 backdrop-blur-md border-border" : ""
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="container mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-[2px] flex items-center justify-center">
            <div className="w-3 h-3 bg-background rounded-full" />
          </div>
          <span className="font-bold tracking-tight text-lg">RECURIS</span>
        </div>
        <a
          href="/"
          className="text-sm font-medium hover:text-muted-foreground transition-colors"
          data-testid="link-login"
        >
          Sign In
        </a>
      </div>
    </motion.header>
  );
}

function Hero({ yBg }: { yBg: any }) {
  return (
    <section className="relative min-h-[90vh] flex items-center pt-20 overflow-hidden">
      <motion.div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ 
          backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')",
          y: yBg 
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background z-0" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border text-xs font-mono text-muted-foreground mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            System active. Scanning for leaks.
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[1.1] mb-8"
          >
            The quiet enforcer of <br className="hidden md:block" />
            <span className="text-muted-foreground">your finances.</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 leading-relaxed"
          >
            Recuris silently hunts down forgotten subscriptions draining your accounts and surfaces exactly what's costing you money before the next charge hits.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <a
              href="/"
              data-testid="button-cta-hero"
              className="inline-flex items-center justify-center gap-2 h-14 px-8 bg-primary text-primary-foreground font-medium text-lg rounded-[4px] hover:bg-primary/90 transition-colors"
            >
              Start Scan <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="/"
              data-testid="button-demo-hero"
              className="inline-flex items-center justify-center gap-2 h-14 px-8 bg-transparent text-foreground border border-border font-medium text-lg rounded-[4px] hover:bg-secondary transition-colors"
            >
              View Sample Report
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Counter({ end, suffix = "", prefix = "" }: { end: number, suffix?: string, prefix?: string }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const duration = 2000;
    const increment = end / (duration / 16);
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    
    return () => clearInterval(timer);
  }, [end]);

  return (
    <span className="font-mono">
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

function SocialProof() {
  return (
    <section className="py-24 border-y border-border bg-secondary/20 relative">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-border">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col gap-2 md:px-8 first:px-0"
          >
            <div className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
              <Counter prefix="£" end={2.4} suffix="M" />
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Saved by users</div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col gap-2 md:px-8 pt-8 md:pt-0"
          >
            <div className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
              <Counter end={18400} suffix="+" />
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Subscriptions detected</div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col gap-2 md:px-8 pt-8 md:pt-0"
          >
            <div className="text-4xl md:text-5xl font-bold tracking-tight text-primary">
              <Counter end={94} suffix="%" />
            </div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Found forgotten subs</div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center mb-24">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">What you don't see<br/>is costing you.</h2>
          <p className="text-lg text-muted-foreground">Companies bank on you forgetting. Free trials that roll over, annual renewals that hide in the noise, duplicate services you haven't used in months.</p>
        </div>
        
        <div className="relative max-w-5xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="border border-border rounded-lg bg-card overflow-hidden shadow-2xl relative"
          >
            <div className="h-12 border-b border-border bg-secondary/50 flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-border" />
                <div className="w-3 h-3 rounded-full bg-border" />
                <div className="w-3 h-3 rounded-full bg-border" />
              </div>
              <div className="mx-auto text-xs font-mono text-muted-foreground">statement_analysis.log</div>
            </div>
            <div className="p-6 md:p-8 font-mono text-sm overflow-x-auto whitespace-pre">
              <div className="text-muted-foreground mb-4">{"// Analyzing transactions... 14 potential leaks found."}</div>
              <div className="flex items-center gap-4 py-2 border-b border-border/50 opacity-50">
                <span className="w-24 text-muted-foreground">04 MAR</span>
                <span className="flex-1">Spotify Premium</span>
                <span className="text-right">£10.99</span>
              </div>
              <div className="flex items-center gap-4 py-2 border-b border-border/50 text-destructive">
                <span className="w-24 opacity-70">12 MAR</span>
                <span className="flex-1 flex items-center gap-2"><Zap className="w-3 h-3" /> Adobe Creative Cloud <span className="text-[10px] border border-destructive/30 px-1 rounded bg-destructive/10">Unused 6mo</span></span>
                <span className="text-right">£54.99</span>
              </div>
              <div className="flex items-center gap-4 py-2 border-b border-border/50 opacity-50">
                <span className="w-24 text-muted-foreground">15 MAR</span>
                <span className="flex-1">Netflix Standard</span>
                <span className="text-right">£10.99</span>
              </div>
              <div className="flex items-center gap-4 py-2 border-b border-border/50 text-destructive">
                <span className="w-24 opacity-70">22 MAR</span>
                <span className="flex-1 flex items-center gap-2"><Zap className="w-3 h-3" /> Unknown "Digital Serv" <span className="text-[10px] border border-destructive/30 px-1 rounded bg-destructive/10">Hidden</span></span>
                <span className="text-right">£14.99</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "Bank-level Security",
      desc: "Read-only access via TrueLayer. We never see or store your credentials. Data is encrypted at rest and in transit."
    },
    {
      icon: <Database className="w-6 h-6" />,
      title: "Deep Context Analysis",
      desc: "Our engine maps transaction patterns, not just names. We catch what basic budgeting apps miss."
    },
    {
      icon: <Lock className="w-6 h-6" />,
      title: "Ruthlessly Private",
      desc: "We charge for the product because you are not the product. No ads, no data selling, no gamification."
    }
  ];

  return (
    <section className="py-32 bg-secondary/30 border-y border-border">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="p-8 border border-border rounded-lg bg-background"
            >
              <div className="w-12 h-12 bg-secondary rounded flex items-center justify-center mb-6 text-primary">
                {f.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{f.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: "01", title: "Connect", desc: "Securely link your accounts via TrueLayer in 30 seconds." },
    { num: "02", title: "Scan", desc: "Our engine processes up to 24 months of history to map your commitments." },
    { num: "03", title: "Enforce", desc: "Review the findings. Cancel the bloat. Keep what matters." }
  ];

  return (
    <section className="py-32">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mb-20">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">Surgical precision.</h2>
          <p className="text-lg text-muted-foreground">No fluffy pie charts. Just the data you need to make decisions.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-12">
            {steps.map((s, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="flex gap-6"
              >
                <div className="font-mono text-2xl text-primary font-bold">{s.num}</div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{s.title}</h3>
                  <p className="text-muted-foreground">{s.desc}</p>
                </div>
              </motion.div>
            ))}
            
            <div className="pt-8">
              <a
                href="/"
                data-testid="button-cta-howitworks"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-colors"
              >
                Start the process
              </a>
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-square rounded-full border border-border border-dashed absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md opacity-20 animate-[spin_60s_linear_infinite]" />
            <div className="aspect-square rounded-full border border-border border-dashed absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 max-w-md opacity-40 animate-[spin_40s_linear_infinite_reverse]" />
            
            <div className="relative bg-card border border-border rounded-lg p-6 shadow-2xl z-10 max-w-sm mx-auto">
              <div className="text-sm font-mono text-muted-foreground mb-6 uppercase tracking-wider flex items-center justify-between">
                <span>Active Targets</span>
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              </div>
              <div className="space-y-4">
                {[
                  { icon: <SiNetflix />, name: "Netflix", amount: "£10.99", alert: false },
                  { icon: <Layers size={16} />, name: "Adobe CC", amount: "£54.99", alert: true },
                  { icon: <SiDropbox />, name: "Dropbox Plus", amount: "£8.99", alert: false },
                  { icon: <SiSpotify />, name: "Spotify", amount: "£10.99", alert: true },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-4 p-3 rounded border ${item.alert ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-secondary/20'}`}>
                    <div className="w-8 h-8 rounded bg-background flex items-center justify-center text-foreground">
                      {item.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{item.name}</div>
                      {item.alert && <div className="text-[10px] text-destructive uppercase tracking-wider">Duplicate detected</div>}
                    </div>
                    <div className="font-mono text-sm">{item.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section className="py-32 bg-secondary/10 border-t border-border">
      <div className="container mx-auto px-6 text-center max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-primary mb-8 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <svg key={i} className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            ))}
          </div>
          <h2 className="text-2xl md:text-4xl font-medium leading-snug mb-12">
            "It feels less like a budgeting app and more like hiring a forensic accountant. It found £1,200 of annual subscriptions I thought I had cancelled."
          </h2>
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded bg-secondary border border-border flex items-center justify-center font-mono text-sm">JS</div>
            <div className="text-left">
              <div className="font-bold">James S.</div>
              <div className="text-sm text-muted-foreground font-mono">Verified User</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-primary opacity-[0.02]" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto text-center"
        >
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Take back control.</h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Stop letting companies quietly drain your accounts. Find your leaks today.
          </p>
          <a
            href="/"
            data-testid="button-cta-final"
            className="inline-flex items-center justify-center gap-2 h-16 px-10 bg-primary text-primary-foreground font-bold text-lg rounded-[4px] hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95"
          >
            Get Started Now
          </a>
          <p className="mt-6 text-sm text-muted-foreground font-mono">Free 14-day scan. Secure connection.</p>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded-[2px] flex items-center justify-center">
            <div className="w-2 h-2 bg-background rounded-full" />
          </div>
          <span className="font-bold tracking-tight">RECURIS</span>
        </div>
        <div className="flex gap-6 text-sm font-medium text-muted-foreground">
          <a href="/" className="hover:text-foreground transition-colors">Privacy</a>
          <a href="/" className="hover:text-foreground transition-colors">Terms</a>
          <a href="/" className="hover:text-foreground transition-colors">Security</a>
          <a href="/" className="hover:text-foreground transition-colors">Contact</a>
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          &copy; {new Date().getFullYear()} Recuris.
        </div>
      </div>
    </footer>
  );
}
