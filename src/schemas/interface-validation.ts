/**
 * Interface validation config schemas
 *
 * Defines the shape of .orchestra/interface-validations.yaml
 */

import { z } from "zod";

const SemverLikeSchema = z
  .string()
  .regex(/^\d+\.\d+(?:\.\d+)?$/, "Version must be semver-like (e.g., 1.0 or 1.0.0)");

export const InterfaceValidationSuccessCriteriaSchema = z.object({
  exitCode: z.number().int().default(0),
  outputContains: z.string().min(1).optional(),
  outputNotContains: z.string().min(1).optional(),
});

export type InterfaceValidationSuccessCriteria = z.output<
  typeof InterfaceValidationSuccessCriteriaSchema
>;

export const InterfaceValidationSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    patterns: z.array(z.string().min(1, "Pattern is required")).min(1),
    command: z.string().min(1).optional(),
    test: z.string().min(1).optional(),
    successCriteria: InterfaceValidationSuccessCriteriaSchema.optional(),
  })
  .refine((data) => data.command !== undefined || data.test !== undefined, {
    message: "Either 'command' or 'test' must be specified",
  })
  .refine((data) => !(data.command && data.test), {
    message: "Only one of 'command' or 'test' can be specified",
  });

export type InterfaceValidation = z.output<typeof InterfaceValidationSchema>;

export const InterfaceValidationConfigSchema = z.object({
  version: SemverLikeSchema,
  validations: z.array(InterfaceValidationSchema).min(1),
});

export type InterfaceValidationConfig = z.output<
  typeof InterfaceValidationConfigSchema
>;
