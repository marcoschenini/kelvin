import type { Metadata } from "next";
import { WelcomeFlight } from "@/components/welcome/welcome-flight";

export const metadata: Metadata = { title: { absolute: "Kelvin · Pharma claims recovery" } };

export default function WelcomePage() {
  return <WelcomeFlight />;
}
