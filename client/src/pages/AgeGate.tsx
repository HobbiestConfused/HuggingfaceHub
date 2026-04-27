import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert } from "lucide-react";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
const days = Array.from({ length: 31 }, (_, i) => i + 1);

interface AgeGateProps {
  onVerified: (dob: string) => void;
}

export default function AgeGate({ onVerified }: AgeGateProps) {
  const [month, setMonth] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleVerify = () => {
    if (!month || !day || !year) {
      setError("Please select your full date of birth.");
      return;
    }

    const dob = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 18) {
      setError("You must be 18 years or older to access this platform.");
      return;
    }

    const dobString = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    onVerified(dobString);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mb-4 glow-primary">
            <img
              src="/manus-storage/expose-logo_c704eb5f.jpg"
              alt="Expose"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="font-serif text-4xl font-bold text-gradient tracking-tight">
            Expose
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            AI Creative Studio & Couples' Playground
          </p>
        </div>

        <Card className="glass-card border-border/50">
          <CardContent className="pt-6 pb-6 px-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-primary/10">
                <ShieldAlert className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg text-foreground">Age Verification</h2>
                <p className="text-sm text-muted-foreground">
                  This platform contains adult content. You must be 18+ to enter.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please confirm your date of birth:
              </p>

              <div className="grid grid-cols-3 gap-3">
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    {days.map(d => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}

              <Button
                onClick={handleVerify}
                className="w-full glow-primary"
                size="lg"
              >
                Verify & Enter
              </Button>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                By entering, you confirm you are at least 18 years of age and agree
                to our terms of service. All content is intended for consenting adults only.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
