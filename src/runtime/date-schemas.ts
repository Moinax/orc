import { format, parseISO } from 'date-fns';
import { z } from 'zod';

// String to Date transformations (for parsing API responses)

export const stringToDateSchema = z.string().transform((val) => parseISO(val));

export const stringToDaySchema = z.string().transform((val) => new Date(`${val}T00:00:00`));

// Date to String transformations (for request bodies)

export const dateToStringSchema = z.coerce.date().transform((val) => val.toISOString());

export const dayToStringSchema = z.coerce.date().transform((val) => format(val, 'yyyy-MM-dd'));

export type DateString = string;
export type DayString = string;
