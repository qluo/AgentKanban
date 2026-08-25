import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Kanban',
  description: 'A local continuity board for humans and coding agents.',
};

const designContract = `
THESIS: Agent work is a routed signal: cards move through a visible five-stage path while continuity opens beside the board, never over it.
OWN-WORLD: Cool operating-console surfaces, precise node-and-line routing, compact workhorse type, and cyan/blue/amber/green state signals.
STORY: Choose a local repository, see its active handoffs, move work directly, and inspect or update the complete continuity record without losing board context.
FIRST VIEWPORT: A thin project and Git rail sits above five equal workflow channels; dense cards carry title, next action or outcome, and checkpoint state. New task is the sole primary action.
FORM: Signal-routing operations desk, grounded direction 6, seed 1c1312a2.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <template
          data-design-contract="1c1312a2"
          dangerouslySetInnerHTML={{ __html: `<!--${designContract}-->` }}
        />
        {children}
      </body>
    </html>
  );
}
