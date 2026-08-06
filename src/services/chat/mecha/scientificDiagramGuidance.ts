import type { MessageMapScope } from '@lobechat/types';

export const SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE =
  '<scientific_diagram_output_guidance>\n' +
  'This chat surface can directly render scientific diagrams from Markdown.\n' +
  '- When the user asks for a TikZ, Chemfig, Circuitikz, or PGFPlots diagram, output the source directly in a fenced code block whose language is exactly `tikz`.\n' +
  '- Each `tikz` fence must contain exactly one complete `\\begin{tikzpicture}` ... `\\end{tikzpicture}` environment. Keep ordinary mathematics in normal Markdown/LaTeX and never emit a raw `tikzpicture` outside the fence.\n' +
  '- The renderer supports syntax shipped by AskCore\'s pinned TikZJax 1.5.0 runtime, including Chemfig, Circuitikz, calc, 3d, PGFPlots, physics, decorations, arrows, positioning, and graphs. Do not claim support for `modiagram`.\n' +
  '- Do not search for or activate a skill, sandbox, or other tool solely to compile, render, or convert an eligible diagram to an image; this chat surface renders it. Tools remain allowed when the user separately requests a file export such as PNG/PDF or another external operation.\n' +
  '</scientific_diagram_output_guidance>';

const SCIENTIFIC_DIAGRAM_GUIDANCE_SCOPES = new Set<MessageMapScope>([
  'group',
  'group_agent',
  'main',
  'thread',
]);

export function appendScientificDiagramGuidance(
  existingSystemRole: string | undefined,
  scope: MessageMapScope | undefined,
): string | undefined;
export function appendScientificDiagramGuidance(
  existingSystemRole: string | null | undefined,
  scope: MessageMapScope | undefined,
): string | null | undefined;
export function appendScientificDiagramGuidance(
  existingSystemRole: string | null | undefined,
  scope: MessageMapScope | undefined,
): string | null | undefined {
  if (!scope || !SCIENTIFIC_DIAGRAM_GUIDANCE_SCOPES.has(scope)) return existingSystemRole;
  if (existingSystemRole?.includes(SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE)) return existingSystemRole;

  return existingSystemRole
    ? `${existingSystemRole}\n\n${SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE}`
    : SCIENTIFIC_DIAGRAM_OUTPUT_GUIDANCE;
}
