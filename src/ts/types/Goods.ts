type WorkerType =
    | "patrician"
    | "smith"
    | "nobles"
    | "equites"
    | "plebeian"
    | "alderman"
    | "wader"
    | "mercators"
    | "libertus";

interface BuildingCost {
    [key: string]: number;
}

type MaintanceCost = {
    [key in WorkerType]: number;
} & {
    money: number;
};

export interface Goods {
    id: string;
    name: string;
    type: string;
    guid: string;
    time: number;
    needs_fuel: boolean;
    building_cost: BuildingCost;
    maintanance_cost: MaintanceCost;
    input: Goods[];
    start_of_chain?: boolean;
}