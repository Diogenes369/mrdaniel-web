import Hero from '../components/Hero';
import TextMarquee from '../components/TextMarquee';
import SystemMetrics from '../components/SystemMetrics';
import TechComparisonMatrix from '../components/TechComparisonMatrix';
import TechCapabilitiesMatrix from '../components/TechCapabilitiesMatrix';
import EdgeCaseSimulator from '../components/EdgeCaseSimulator';
import CyberAuditMatrix from '../components/CyberAuditMatrix';
import Web3DevSection from '../components/Web3DevSection';
import DeploymentRoadmap from '../components/DeploymentRoadmap';
import AdvancedRoiCalculator from '../components/AdvancedRoiCalculator';
import PremiumAdvantage from '../components/PremiumAdvantage';
import CyberNewsGrid from '../components/CyberNewsGrid';
import Magazines from '../components/Magazines';
import ContactPortal from '../components/ContactPortal';

export default function HomePage() {
  return (
    <>
      <Hero />
      <TextMarquee />
      <SystemMetrics />
      <TechComparisonMatrix />
      <TechCapabilitiesMatrix />
      <EdgeCaseSimulator />
      <CyberAuditMatrix />
      <Web3DevSection />
      <DeploymentRoadmap />
      <AdvancedRoiCalculator />
      <PremiumAdvantage />
      <CyberNewsGrid />
      <Magazines />
      <ContactPortal />
    </>
  );
}
