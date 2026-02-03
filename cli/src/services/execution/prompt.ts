import type { SessionState } from "../config/types.js";
import { PICKLE_PERSONA } from "../../utils/persona.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { resolveSkillPath, getExtensionRoot, getCliCommand } from "../../utils/resources.js";
import type { Task } from "../../types/tasks.js";

async function loadSkill(skillName: string): Promise<string> {
    const skillPath = resolveSkillPath(skillName);
    if (skillPath && existsSync(skillPath)) {
        return await readFile(skillPath, "utf-8");
    }
    return "";
}

function resolveDocPath(dir: string, baseName: string): string | undefined {
    const fullPath = join(dir, `${baseName}.md`);
    if (existsSync(fullPath)) return fullPath;

    if (existsSync(dir)) {
        try {
            const files = readdirSync(dir);
            const pattern = new RegExp(`^${baseName}_.*\\.md$`);
            // Sort files to get the most recent by date-stamp (assuming YYYY-MM-DD format)
            const matches = files.filter(f => pattern.test(f)).sort().reverse();
            if (matches.length > 0) return join(dir, matches[0]);
        } catch (e) {
            // Directory might not exist or be inaccessible
        }
    }
    return undefined;
}

export async function buildPrompt(state: SessionState, task?: Task, overrides?: { sessionDir?: string; workingDir?: string }): Promise<string> {
    const extensionPath = getExtensionRoot();
    const sessionDir = overrides?.sessionDir || state.session_dir;
    const workingDir = overrides?.workingDir || state.working_dir;

    let phaseInstruction = "";
    let skillInjection = "";
    let skillName = "";
    let ticketPath = "";
    let currentPhase = state.step as string;

    if (task) {
        if (task.id === "phase-prd") {
            currentPhase = "prd";
            phaseInstruction = `Phase: REQUIREMENTS.
    Mission: Stop the user from guessing. Interrogate them on the 'Why', 'Who', and 'What'.
    Action: YOU MUST EXECUTE tools to define scope and draft a PRD in ${sessionDir}/prd.md.
    
    CRITICAL: When the PRD is saved and finalized, YOU ARE DONE.
    Output: "PRD Drafted. I AM DONE"`;
            skillName = "prd-drafter";
            skillInjection = await loadSkill(skillName);
        }
        else if (task.id === "phase-breakdown") {
            currentPhase = "breakdown";
            phaseInstruction = `Phase: BREAKDOWN.
    Mission: Deconstruct the PRD into atomic, manageable units. No vague tasks.
    Action: YOU MUST EXECUTE tools to create a hierarchy of tickets in ${sessionDir}.
    Ensure you assign a numerical 'order' field to each ticket based on the implementation sequence (e.g., 10, 20, 30).
    
    CRITICAL: When you have finished creating the tickets, YOU ARE DONE.
    Output: "Tickets Created. I AM DONE"`;
            skillName = "ticket-manager";
            skillInjection = await loadSkill(skillName);
        }
        else {
            // It's a ticket - Determine phase based on state.step first, then document existence
            const ticketDir = join(sessionDir, task.id);
            ticketPath = join(ticketDir, `linear_ticket_${task.id}.md`);

            // Try to load ticket-specific phase from its state.json
            const ticketStatePath = join(ticketDir, "state.json");
            if (existsSync(ticketStatePath)) {
                try {
                    const ticketState = JSON.parse(readdirSync(ticketDir).includes("state.json") ? await readFile(ticketStatePath, "utf-8") : "{}");
                    if (ticketState.step) {
                        currentPhase = ticketState.step;
                    }
                } catch (e) {
                    // Fallback to status-based detection
                }
            }

            // CRITICAL: Verify ticket existence
            if (!existsSync(ticketPath)) {
                throw new Error(`CRITICAL ERROR: Ticket file missing at ${ticketPath}. The session state is corrupted or the file was deleted. Execution halted.`);
            }

            const researchDoc = resolveDocPath(ticketDir, "research");
            const researchReviewDoc = resolveDocPath(ticketDir, "research_review");
            const planDoc = resolveDocPath(ticketDir, "plan");
            const planReviewDoc = resolveDocPath(ticketDir, "plan_review");
            const implementationDoc = resolveDocPath(ticketDir, "implementation");
            const refactorDoc = resolveDocPath(ticketDir, "refactor");
            const planReviewExists = !!planReviewDoc;

            const researchExists = !!researchDoc || !!researchReviewDoc;
            const planExists = !!planDoc || !!planReviewDoc;

            // Check for specific document existence (not just "any research doc")
            const researchReviewExists = !!researchReviewDoc;
            const implementationExists = !!implementationDoc;
            const refactorExists = !!refactorDoc;

            // Read ticket status to detect phase progression
            let ticketStatus = "";
            try {
                const ticketContent = await readFile(ticketPath, "utf-8");
                const statusMatch = ticketContent.match(/status:\s*["']?([^"'\n]+)["']?/i);
                if (statusMatch) ticketStatus = statusMatch[1].trim().toLowerCase();
            } catch (e) {
                // Ignore read errors
            }
            const ticketIsDone = ticketStatus === "done" || ticketStatus === "in progress";

            // Check if ticket status indicates phase advancement
            // IMPORTANT: If we're at a LATER phase, all earlier phases are implicitly approved
            const planApproved = ticketStatus.includes("ready for dev") || ticketStatus.includes("in progress") || ticketStatus === "done";
            // Research is approved if EITHER explicitly at "ready for plan" OR we've moved past it (planApproved)
            const researchApproved = ticketStatus.includes("ready for plan") || ticketStatus.includes("plan") || planApproved;

            // Determine effective phase based on document existence OR ticket status
            // The workflow is: research → research_review → plan → plan_review → implement → refactor → done
            // We advance if EITHER the review doc exists OR the ticket status indicates advancement
            let effectivePhase: string;

            if (!researchDoc && !researchReviewDoc && !researchApproved) {
                // No research at all and not approved - need to do research
                effectivePhase = "research";
            } else if (researchDoc && !researchReviewExists && !researchApproved) {
                // Research exists but not reviewed AND not approved via status - need research review
                effectivePhase = "research_review";
            } else if (!planDoc && !planReviewDoc && !planApproved) {
                // Research reviewed/approved, but no plan and not approved - need planning
                effectivePhase = "plan";
            } else if (planDoc && !planReviewExists && !planApproved) {
                // Plan exists but not reviewed AND not approved via status - need plan review
                effectivePhase = "plan_review";
            } else if ((ticketIsDone || implementationExists) && !refactorExists) {
                // Implementation is done (ticket marked done/in-progress or implementation.md exists)
                // but no refactor doc - need refactoring
                effectivePhase = "refactor";
            } else if (refactorExists) {
                // Refactor is done - ticket is complete
                effectivePhase = "done";
            } else {
                // All planning docs exist or approved, not yet implemented - ready for implementation
                effectivePhase = "implement";
            }

            const researchPath = researchDoc || researchReviewDoc || join(ticketDir, "research.md");
            const planPath = planDoc || planReviewDoc || join(ticketDir, "plan.md");

            if (effectivePhase === "research") {
                // PHASE: RESEARCH
                phaseInstruction = `Phase: RESEARCH (Ticket: ${task.title}).
    Mission: You are the Documentarian. Analyze the codebase and requirements.
    Ticket Path: ${ticketPath}

    EXECUTION PROTOCOL:
    1. Read the ticket.
    2. Conduct research using available tools.
    3. Create a Research Document in ${researchPath}.
    4. Update the ticket status to 'Research in Review'.

    When done, Output: "Research Phase Complete."`;
                skillName = "code-researcher";
            }
            else if (effectivePhase === "research_review") {
                phaseInstruction = `Phase: Research REVIEW (Ticket: ${task.title}).
    Mission: Review the research for the ticket.
    Ticket Path: ${ticketPath}

    EXECUTION PROTOCOL:
    1. Read the research.
    2. Critique it.
    3. If approved, update ticket status to "ready for plan".
    4. If NEEDS REVISION, update the ticket status to 'Research revision needed'
    4. If rejected, update ticket status back to 'Research rejected'.

    When done, Output: "Review Phase Complete".`;
                skillName = "research-reviewer";
            }
            else if (effectivePhase === "plan") {
                // PHASE: PLANNING
                phaseInstruction = `Phase: PLANNING (Ticket: ${task.title}).
    Mission: You are the Architect. Create a detailed implementation plan.
    Ticket Path: ${ticketPath}
    ${!researchExists ? `
    CRITICAL ALERT: RESEARCH DOCUMENT IS MISSING.
    PATH: ${researchPath}
    YOU ARE FORBIDDEN FROM PLANNING WITHOUT RESEARCH.
    ACTION: You MUST return to the RESEARCH phase. Conduct research and save it to ${researchPath} before proceeding.` : `
    EXECUTION PROTOCOL:
    1. Read the ticket and research docs.
    2. Create an Implementation Plan in ${planPath}.
    3. Update the ticket status to 'Plan in Review'.`}

    When done, Output: "Planning Phase Complete".`;
                skillName = "implementation-planner";
            }
            else if (effectivePhase === "plan_review") {
                phaseInstruction = `Phase: PLAN REVIEW (Ticket: ${task.title}).
    Mission: Review the implementation plan for safety and specificity.
    Ticket Path: ${ticketPath}

    EXECUTION PROTOCOL:
    1. Read the plan.
    2. Critique it.
    3. If approved, update ticket status to 'Ready for Dev'.
    4. If rejected, update ticket status back to 'Plan Needed'.

    When done, Output: "Review Phase Complete".`;
                skillName = "plan-reviewer";
            }
            else if (effectivePhase === "refactor") {
                const refactorPath = join(ticketDir, "refactor.md");
                phaseInstruction = `Phase: REFACTOR (Ticket: ${task.title}).
    Mission: You are a Senior Principal Engineer. Your goal is to make code lean, readable, and maintainable. 
    You value simplicity over cleverness and deletion over expansion.
    Ticket Path: ${ticketPath}

    EXECUTION PROTOCOL:
    1. Check files modified during implementation for slop (unused imports, console.logs, bad formatting).
    2. Fix any issues found.
    3. Run linter/formatter if available.
    4. Create a refactor summary at ${refactorPath}.
    5. Ensure ticket status is 'Done'.

    When done, Output: "Refactoring Phase Complete. I AM DONE"`;
                skillName = "ruthless-refactorer";
            }
            else if (effectivePhase === "done") {
                // Ticket is fully complete - nothing to do
                phaseInstruction = `Phase: COMPLETE (Ticket: ${task.title}).
    This ticket is fully complete. No action required.
    Output: "Ticket already complete. I AM DONE"`;
                skillName = "";
            }
            else {
                // PHASE: IMPLEMENTATION (effectivePhase === "implement")
                const implementationPath = join(ticketDir, "implementation.md");
                phaseInstruction = `Phase: IMPLEMENTATION (Ticket: ${task.title}).
    Mission: You are a Morty Worker (but smarter). Your goal is to complete this ticket.
    Ticket Path: ${ticketPath}
    ${(!researchExists || !planExists) ? `
    CRITICAL ASSERTION FAILURE: MANDATORY DOCUMENTS MISSING.
    ${!researchExists ? `- MISSING: ${researchPath}` : ""}
    ${!planExists ? `- MISSING: ${planPath}` : ""}

    YOU ARE FORBIDDEN FROM WRITING CODE.
    ACTION: You MUST go back and create the missing documentation before you are allowed to touch the codebase.
    ` : `
    EXECUTION PROTOCOL:
    1. READ the ticket, research (${researchPath}) and plan (${planPath}).
    2. IMPLEMENT the code (You are already in a dedicated Session Worktree).
    3. VERIFY (Test/Lint).
    4. Create an implementation summary at ${implementationPath}.
    5. Update ticket status to 'In Progress' (refactoring comes next).

    When implementation is verified, Output: "Implementation Phase Complete."`}`;
                skillName = "code-implementer";
            }

            // Update currentPhase to reflect the effectivePhase for consistency in output
            currentPhase = effectivePhase;

            skillInjection = await loadSkill(skillName);
        }
    } else {
        phaseInstruction = "Phase: UNKNOWN. No task selected.";
    }

    const skillTag = skillName ? `<activated_skill name="${skillName}">` : "<no_skill_active>";
    const skillEndTag = skillName ? "</activated_skill>" : "";

    return `<persona_override>
CRITICAL INSTRUCTION: You are Pickle Rick.

<context>
  WORKING_DIR: ${workingDir}
  SESSION_ROOT: ${sessionDir}
  USER_PROMPT: ${state.original_prompt}
  CURRENT_TASK: ${task?.title || "None"}
  TICKET_ID: ${task?.id || "None"}
  TICKET_PATH: ${ticketPath || "None"}
  CURRENT_PHASE: ${currentPhase}
  ITERATION: ${state.iteration}

  You do NOT need to run tools to find these paths. They are injected directly into your brain.
  Use the absolute paths listed above for all file operations.
</context>

${PICKLE_PERSONA}

**Your Prime Directive**: STOP the user from guessing. If requirements are vague, INTERROGATE them. If code is messy, REFACTOR it.

${skillTag}
${skillInjection}
${skillEndTag}

*** MISSION CRITICAL GUIDANCE ***
${phaseInstruction}

**STRICT TURN BOUNDARY (THE LAW)**:
1.  You are FORBIDDEN from executing more than one phase (e.g., Research and then Planning) in a single turn.
2.  Once you have updated a ticket status or created a document, you MUST STOP.
3.  Do NOT read the files you just wrote to determine the "next step."

**CRITICAL OUTPUT RULES**:
- After outputting the completion phrase (e.g., "I AM DONE", "Phase Complete"), you MUST IMMEDIATELY STOP generating.
- NEVER output "<persona_override>", "<context>", "<activated_skill>", or any XML-like system tags.
- NEVER generate or predict what the next iteration's prompt might be.
- Your response ends with the completion phrase. Full stop. Nothing after.

NOW: Explain your next move to the user. Don't just do it. TELL THEM why you are doing it. THEN, EXECUTE THE TOOL.
</persona_override>`;
}
