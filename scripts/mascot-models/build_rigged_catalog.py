"""Apply one reviewed canonical rig to full single-accessory cats.

This is an export/review batch, not automatic visual acceptance.
"""
import argparse,json,subprocess,sys
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent
ASSETS=Path('Q:/NAVA-Workspace/NAVA-App/Build/Assets/Mascot/wardrobe-v3')
BLENDER=Path('Q:/NAVA-Workspace/NAVA-App/Tools/Blender/blender-5.2.2-windows-x64/blender.exe')
def main():
    p=argparse.ArgumentParser();p.add_argument('--part',type=int,default=0);p.add_argument('--parts',type=int,default=1);a=p.parse_args()
    manifest=json.loads((ROOT/'wardrobe-production.json').read_text(encoding='utf-8'))
    entries=[{'slug':'base','candidate':manifest['canonicalBase']}]+manifest['items']
    for i,item in enumerate(entries):
        if i%a.parts!=a.part:continue
        slug=item['slug'];out=ASSETS/'rigged-v1'/slug;out.mkdir(parents=True,exist_ok=True)
        report=out/'rig-report.json';board_path=out/'deformation-board.png'
        if report.exists() and board_path.exists() and Path(json.loads(report.read_text())['source']).resolve()==Path(item['candidate']).resolve() and report.stat().st_mtime>max((ROOT/'rig_fitted_cat.py').stat().st_mtime,Path(item['candidate']).stat().st_mtime):
            print(json.dumps({'slug':slug,'status':'existing current build; visual review still required'}),flush=True);continue
        with (out/'build.log').open('w',encoding='utf-8') as log:
            subprocess.run([str(BLENDER),'--background','--python',str(ROOT/'rig_fitted_cat.py'),'--','--input',item['candidate'],'--slug',slug,'--output',str(out),'--review'],stdout=log,stderr=subprocess.STDOUT,check=True)
        board=Image.new('RGB',(5*256,4*280),(217,234,247));draw=ImageDraw.Draw(board)
        for row,pose in enumerate(['neutral','wave','ball-contact','stretch']):
            for col,angle in enumerate([0,45,90,180,270]):
                f=out/f'{pose}-{angle}.png';im=Image.open(f).convert('RGB');im.thumbnail((256,256));board.paste(im,(col*256,row*280+24));draw.text((col*256+5,row*280+4),f'{pose} {angle}',fill=(25,48,70))
        board.save(out/'deformation-board.png')
        print(json.dumps({'slug':slug,'output':str(out),'visualReview':'PENDING'}),flush=True)
if __name__=='__main__':main()
