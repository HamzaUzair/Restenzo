import type { Metadata } from "next";
import Hero from "@/components/site/home/Hero";
import TrustBar from "@/components/site/home/TrustBar";
import FeatureGrid from "@/components/site/home/FeatureGrid";
import SingleVsMulti from "@/components/site/home/SingleVsMulti";
import RoleSection from "@/components/site/home/RoleSection";
import Workflow from "@/components/site/home/Workflow";
import Stats from "@/components/site/home/Stats";
import Testimonials from "@/components/site/home/Testimonials";
import FinalCTA from "@/components/site/home/FinalCTA";

export const metadata: Metadata = {
  title: { absolute: "Restenzo" },
  description:
    "Restenzo is the all in one restaurant management platform for single and multi branch restaurants orders, live kitchen, cashier, multi branch, expenses, day end and analytics. Built for modern restaurants.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustBar />
      <FeatureGrid />
      <SingleVsMulti />
      <RoleSection />
      <Workflow />
      <Stats />
      <Testimonials />
      <FinalCTA />
    </>
  );
}
