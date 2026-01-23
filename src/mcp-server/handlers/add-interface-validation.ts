/**
 * add_interface_validation tool handler
 *
 * Adds a new interface validation entry to .orchestra/interface-validations.yaml.
 */

import { addInterfaceValidation } from "../../core/interface-validation.js";
import {
  AddInterfaceValidationInputSchema,
  type AddInterfaceValidationInput,
} from "../../schemas/interface-validation.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleAddInterfaceValidation(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(AddInterfaceValidationInputSchema, input);

  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  try {
    const output = await addInterfaceValidation(
      validation.data as AddInterfaceValidationInput,
    );
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "add_interface_validation",
        role: "implementor",
        input: validation.data,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "add_interface_validation",
        role: "implementor",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
