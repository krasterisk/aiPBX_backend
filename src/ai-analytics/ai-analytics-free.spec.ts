import { AiAnalyticsService } from './ai-analytics.service';
import { AiAnalyticsController } from './ai-analytics.controller';
import { OperatorAnalyticsController } from '../operator-analytics/operator-analytics.controller';
import { ROLES_KEY } from '../auth/roles-auth.decorator';
it('protects both free HTTP routes with ADMIN role metadata',()=>{
 expect(Reflect.getMetadata(ROLES_KEY,AiAnalyticsController.prototype.regenerateFree)).toEqual(['ADMIN']);
 expect(Reflect.getMetadata(ROLES_KEY,OperatorAnalyticsController.prototype.regenerateFree)).toEqual(['ADMIN']);
});
it('regenerates a robot analysis without charging, preserves prior paid costs and records free usage',async()=>{
 const existing:any={cost:2,update:jest.fn(async fields=>({...fields}))};
 const analytics:any={findOne:jest.fn(async()=>existing),create:jest.fn(async x=>x)};
 const calls:any={findOne:jest.fn(async()=>({channelId:'bot',userId:'99',source:'call'}))};
 const billing:any={chargeAnalytics:jest.fn(async()=>3),recordFreeAnalysis:jest.fn()};
 const events:any={getDialogs:jest.fn(async()=>[{role:'User',text:'Hello'},{role:'Assistant',text:'Hi'}])};
 const model:any={chatCompletion:jest.fn(async()=>({content:JSON.stringify({scenario_analysis:{success:true},user_satisfaction:{csat:5,sentiment:'Positive'}}),usage:{total_tokens:100}}))};
 const service=new AiAnalyticsService(analytics,calls,billing,events,model);
 await expect(service.regenerateFree('bot',false)).rejects.toMatchObject({status:403});expect(model.chatCompletion).not.toHaveBeenCalled();
 const result=await service.regenerateFree('bot',true);expect(result.cost).toBe(2);expect(billing.chargeAnalytics).not.toHaveBeenCalled();expect(billing.recordFreeAnalysis).toHaveBeenCalledWith('bot','99',100);
 await service.analyzeCall('other');expect(billing.chargeAnalytics).toHaveBeenCalledWith('other',100);
});
