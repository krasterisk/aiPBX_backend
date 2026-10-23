import { HelpdeskEmailContextService } from './helpdesk-email-context.service';
import { compileTopicEdit, topicHash } from './analytics-topics';

describe('scoped topic endpoint transaction', () => {
    const initial = [{ id: 'booking', name: 'Booking', aliases: [], future: 'preserve' }];
    let service: HelpdeskEmailContextService;
    let project: any;
    let projects: any;
    const tx = { LOCK: { UPDATE: 'UPDATE' } };
    const edit = () => ({expected_hash:topicHash(initial),mode:'create' as const,topic_id:'delivery',
        changes:{name:'Delivery',description:'Delivery status'}});
    const dto = () => ({cabinetId:20,projectId:7,edit:edit(),after_hash:topicHash(compileTopicEdit(initial,edit())),execution_id:'a'.repeat(32)});
    beforeEach(() => {
        project = {callTaxonomy:JSON.parse(JSON.stringify(initial)),save:jest.fn().mockResolvedValue(undefined)};
        projects = {findOne:jest.fn().mockResolvedValue(project),sequelize:{transaction:jest.fn(fn=>fn(tx))}};
        service = new HelpdeskEmailContextService({} as any,projects,{} as any,{} as any,{} as any,{} as any);
        jest.spyOn(service,'getBoundSupportContext').mockResolvedValue({clientId:'20',projectId:7,reporting:{callTaxonomy:initial}} as any);
    });
    it('locks only the bound project and writes only taxonomy', async () => {
        expect(await service.editTopics(1,dto())).toMatchObject({status:'applied',changed:true,hash:dto().after_hash});
        expect(projects.findOne).toHaveBeenCalledWith({where:{id:7,userId:'20'},transaction:tx,lock:'UPDATE'});
        expect(project.save).toHaveBeenCalledWith({fields:['callTaxonomy'],transaction:tx});
        expect(project.callTaxonomy[0]).toEqual(initial[0]);
    });
    it('rejects authorization failure before transaction', async () => {
        (service.getBoundSupportContext as jest.Mock).mockRejectedValue(new Error('Forbidden'));
        await expect(service.editTopics(2,dto())).rejects.toThrow('Forbidden');
        expect(projects.sequelize.transaction).not.toHaveBeenCalled();
    });
    it('rejects stale state, foreign projects and modified approved output before save', async () => {
        project.callTaxonomy.push({id:'other',name:'Other'});
        await expect(service.editTopics(1,dto())).rejects.toThrow('Stale');
        expect(project.save).not.toHaveBeenCalled();
        project.callTaxonomy=initial;
        await expect(service.editTopics(1,{...dto(),after_hash:'b'.repeat(64)})).rejects.toThrow('hash mismatch');
        projects.findOne.mockResolvedValue(null);
        await expect(service.editTopics(1,dto())).rejects.toThrow('outside selected cabinet');
        expect(project.save).not.toHaveBeenCalled();
    });
    it('does not save when the exact result already exists', async () => {
        project.callTaxonomy=compileTopicEdit(initial,edit());
        expect(await service.editTopics(1,dto())).toMatchObject({changed:false});
        expect(project.save).not.toHaveBeenCalled();
    });
    it('exposes a read hash without calls or transcripts', async () => {
        expect(await service.getTopicSettings(1,{cabinetId:20,projectId:7})).toMatchObject({hash:topicHash(initial),topics:initial,historicalReanalysis:false});
        expect(projects.sequelize.transaction).not.toHaveBeenCalled();
    });
});
