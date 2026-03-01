import { z, ZodDiscriminatedUnion, ZodError, ZodObject, ZodTypeAny } from 'zod';
import { formatError, ParseError } from './errors';

function applyPartial(schema: ZodTypeAny, discriminator?: string): ZodTypeAny {
  if (schema instanceof ZodObject) {
    const shape = schema._def.shape();
    const partialShape: Record<string, ZodTypeAny> = {};

    for (const [key, value] of Object.entries(shape)) {
      const transformedValue = applyPartial(value as ZodTypeAny, discriminator);
      partialShape[key] = key === discriminator ? transformedValue : transformedValue.optional();
    }

    return z.object(partialShape);
  }

  if (schema instanceof ZodDiscriminatedUnion) {
    const partialOptions = schema.options.map((option: unknown) => {
      if (option instanceof ZodObject) {
        return applyPartial(option, schema.discriminator);
      }
      return option;
    });
    return z.discriminatedUnion(schema.discriminator, partialOptions);
  }

  if (schema instanceof z.ZodArray) {
    return z.array(applyPartial(schema.element, discriminator));
  }

  if (schema instanceof z.ZodNullable) {
    return applyPartial(schema.unwrap(), discriminator).nullable();
  }

  if (schema instanceof z.ZodOptional) {
    return applyPartial(schema.unwrap(), discriminator).optional();
  }

  return schema;
}

export function parseSchema<S extends ZodTypeAny>(schema: S, data: any, partial = false): z.infer<S> {
  try {
    if (partial) {
      return applyPartial(schema).parse(data);
    } else if (schema instanceof ZodObject) {
      return schema.strict().parse(data);
    } else {
      return schema.parse(data);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      if (!partial) {
        console.warn(formatError(error, schema, data));
        return parseSchema(schema, data, true);
      }
      throw new ParseError(error, schema, data);
    }
    throw error;
  }
}
