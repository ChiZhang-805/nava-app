"""Produce fresh import metrics and camera evidence; never auto-approve visuals."""
from pathlib import Path
import subprocess,sys,json

BLENDER=Path('Q:/NAVA-Workspace/NAVA-App/Tools/Blender/blender-5.2.2-windows-x64/blender.exe')
ROOT=Path(__file__).resolve().parent
ASSETS=Path('Q:/NAVA-Workspace/NAVA-App/Build/Assets/Mascot/wardrobe-v3')
EVIDENCE=Path('Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/wardrobe-v3')
INSPECT=Path('Q:/Codex/Live/skills/blender-asset-validation/scripts/inspect_asset.py')

def run(folder,slug,height):
    out=EVIDENCE/folder;out.mkdir(parents=True,exist_ok=True)
    asset=ASSETS/folder/(slug+'.glb')
    covered='cape' if slug=='raindrop-cape' else 'neck' if slug in ('cloud-scarf','honey-neck-warmer','aurora-scarf') else 'hat' if slug in ('mist-beret','sailor-hat','night-voyage-cap') else 'none'
    subprocess.run([sys.executable,str(ROOT/'verify_canonical_in_glb.py'),'--input',str(asset),'--output',str(out/'preservation.json'),'--covered',covered],check=True)
    for label,script,args in [
        ('inspect',INSPECT,['--input',str(asset),'--output',str(out/'inspection.json')]),
        ('render',ROOT/'render_worn_asset_review.py',['--input',str(asset),'--output',str(out),'--resolution','640','--frames','24','--contact-z',str(height)])]:
        with (out/(label+'.log')).open('w',encoding='utf-8') as log:
            subprocess.run([str(BLENDER),'--background','--python',str(script),'--',*args],stdout=log,stderr=subprocess.STDOUT,check=True)
    subprocess.run([sys.executable,str(ROOT/'assemble_review_boards.py'),str(out)],check=True)
    report=json.loads((out/'inspection.json').read_text(encoding='utf-8'))
    print(json.dumps({'folder':folder,'technicalPass':report['hard_gate_pass'],'issues':report['issues'],'visualReview':'PENDING actual inspection'}),flush=True)

if __name__=='__main__':
    for spec in sys.argv[1:]:
        folder,slug,height=spec.split(':');run(folder,slug,float(height))
