/**
 * Spanish translations for the exercise catalogue's facet vocabulary:
 * `category` (10 values), `equipment` (28 values) and `target` (19 values)
 * from data/exercises.json — the full distinct set for each, translated once
 * and mapped back per record, rather than per the 1324 individual rows.
 */
import type { FacetKey } from '../types';

const CATEGORY_ES: Record<string, string> = {
  back: 'espalda',
  cardio: 'cardio',
  chest: 'pecho',
  'lower arms': 'antebrazos',
  'lower legs': 'piernas (parte baja)',
  neck: 'cuello',
  shoulders: 'hombros',
  'upper arms': 'brazos (parte alta)',
  'upper legs': 'piernas (parte alta)',
  waist: 'cintura/abdomen',
};

const EQUIPMENT_ES: Record<string, string> = {
  assisted: 'asistido',
  band: 'banda',
  barbell: 'barra',
  'body weight': 'peso corporal',
  'bosu ball': 'bosu',
  cable: 'polea',
  dumbbell: 'mancuerna',
  'elliptical machine': 'máquina elíptica',
  'ez barbell': 'barra Z',
  hammer: 'máquina Hammer',
  kettlebell: 'pesa rusa',
  'leverage machine': 'máquina de palanca',
  'medicine ball': 'balón medicinal',
  'olympic barbell': 'barra olímpica',
  'resistance band': 'banda de resistencia',
  roller: 'rodillo',
  rope: 'cuerda',
  'skierg machine': 'máquina SkiErg',
  'sled machine': 'trineo',
  'smith machine': 'máquina Smith',
  'stability ball': 'balón de estabilidad',
  'stationary bike': 'bicicleta estática',
  'stepmill machine': 'escaladora',
  tire: 'neumático',
  'trap bar': 'barra hexagonal',
  'upper body ergometer': 'ergómetro de tren superior',
  weighted: 'con peso añadido',
  'wheel roller': 'rueda abdominal',
};

const TARGET_ES: Record<string, string> = {
  abductors: 'abductores',
  abs: 'abdominales',
  adductors: 'aductores',
  biceps: 'bíceps',
  calves: 'gemelos',
  'cardiovascular system': 'sistema cardiovascular',
  delts: 'deltoides',
  forearms: 'antebrazos',
  glutes: 'glúteos',
  hamstrings: 'isquiotibiales',
  lats: 'dorsales',
  'levator scapulae': 'elevador de la escápula',
  pectorals: 'pectorales',
  quads: 'cuádriceps',
  'serratus anterior': 'serrato anterior',
  spine: 'columna',
  traps: 'trapecios',
  triceps: 'tríceps',
  'upper back': 'espalda alta',
};

export const FACET_DICTIONARIES: Record<FacetKey, Record<string, string>> = {
  category: CATEGORY_ES,
  equipment: EQUIPMENT_ES,
  target: TARGET_ES,
};
