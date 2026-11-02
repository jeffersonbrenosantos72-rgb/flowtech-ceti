export type SubjectCategory = 'BNCC' | 'Técnica' | 'Recomposição/Eletiva';
export type PageId = 'inicio' | 'horarios' | 'boletim' | 'cardapio' | 'transporte' | 'mural' | 'calendario';
export type Weekday = 'Segunda-feira' | 'Terça-feira' | 'Quarta-feira' | 'Quinta-feira' | 'Sexta-feira';

/** As três notas já publicadas; a quarta é informada somente no simulador. */
export interface Subject {
  id: string;
  name: string;
  category: SubjectCategory;
  teacher: string;
  grades: readonly [number, number, number];
  absences: number;
  totalClasses: number;
}

export interface ScheduleLesson {
  period: number;
  time: string;
  subject: string;
  room: string;
  teacher: string;
  category: SubjectCategory;
}

export interface Meal {
  name: string;
  time: string;
  description: string;
  calories: number;
  allergens: string;
}

export interface MenuDay {
  weekday: Weekday;
  cycle: '1/3' | '2/4';
  meals: readonly [Meal, Meal, Meal];
}

export interface TransportStop {
  place: string;
  time: string;
}

export interface TransportRoute {
  id: string;
  sheet: string;
  vehicle: string;
  service: string;
  start: string;
  arrival: string;
  driver: string;
  monitor: string;
  status: 'Em operação' | 'Atenção';
  stops: readonly TransportStop[];
}
