import {expect,it} from 'vitest';
import {profileSchema} from '../auth/validation';
import {filtersSchema} from './validation';
it('keeps broad profile interests from advertising unsupported social filters',()=>{expect(profileSchema.safeParse({username:'member',displayName:'Member',bio:'',visibility:'members',interests:['music','gaming'],games:[],platforms:[]}).success).toBe(true);expect(filtersSchema.safeParse({interest:'music'}).success).toBe(false);expect(filtersSchema.safeParse({interest:'co-op'}).success).toBe(true);});
